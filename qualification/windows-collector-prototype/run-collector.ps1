param(
    [Parameter(Mandatory=$true)][string]$Manifest,
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256,
    [Parameter(Mandatory=$true)][string]$Scratch,
    [Parameter(Mandatory=$true)][string]$SourceRepositoryRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$utf8 = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
function WriteJson($Path, $Value) {
    [System.IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 30) + "`n", $utf8)
}
function Digest($Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Within($Root, $Candidate) {
    return $Candidate -eq $Root -or $Candidate.StartsWith($Root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)
}
function OutsideSource($Root, $Candidate) {
    if ((Within $Root $Candidate) -or (Within $Candidate $Root)) { throw 'PROTECTED_SOURCE_ROOT' }
}
function CheckLocal($Path) {
    if ($Path.StartsWith('\\') -or $Path.StartsWith('//')) { throw 'LOCAL_NTFS_REQUIRED' }
    $full = [System.IO.Path]::GetFullPath($Path)
    if ($full.StartsWith('\\') -or $full -notmatch '^[A-Za-z]:\\') { throw 'LOCAL_NTFS_REQUIRED' }
    $drive = New-Object -TypeName System.IO.DriveInfo -ArgumentList ([System.IO.Path]::GetPathRoot($full))
    if ($drive.DriveType -ne [System.IO.DriveType]::Fixed -or $drive.DriveFormat -ne 'NTFS') { throw 'LOCAL_NTFS_REQUIRED' }
    $current = $full
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_POINT_REFUSED' }
        }
        $parent = [System.IO.Path]::GetDirectoryName($current)
        if ($parent -eq $current) { break }
        $current = $parent
    }
    return $full
}
function HashInputs($Bundle, $Entries) {
    $actual = [ordered]@{}
    foreach ($entry in $Entries) {
        if ($entry.path -notmatch '^[A-Za-z0-9_.-]+$' -or $actual.Contains($entry.path)) { throw 'INPUT_PATH_REFUSED' }
        $full = CheckLocal (Join-Path $Bundle $entry.path)
        $actual[$entry.path] = Digest $full
        if ($actual[$entry.path] -ne $entry.sha256) { throw "INPUT_HASH:$($entry.path)" }
    }
    return $actual
}

$run = $null
$savedNodeOptions = $env:NODE_OPTIONS
$savedNodePath = $env:NODE_PATH
$savedTemp = $env:TEMP
$savedTmp = $env:TMP
$savedLocation = Get-Location
try {
    if ($env:OS -ne 'Windows_NT' -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -or -not [Environment]::Is64BitProcess) { throw 'NATIVE_WINDOWS_X64_REQUIRED' }
    if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'ADD_TYPE_POLICY_UNAVAILABLE' }
    $manifestPath = CheckLocal (Resolve-Path -LiteralPath $Manifest).Path
    if ((Digest $manifestPath) -ne $ManifestSha256) { throw 'TRUSTED_MANIFEST_HASH' }
    $config = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($config.schema -ne 1 -or $config.kind -ne 'COLLECTOR-ONLY-PROTOTYPE') { throw 'MANIFEST_SCOPE' }
    $bundle = Split-Path -Parent $manifestPath
    if ((CheckLocal $PSCommandPath) -ne (Join-Path $bundle 'run-collector.ps1')) { throw 'RUNNER_IDENTITY' }
    $requiredFiles = @('.gitattributes', 'NativeCollector.cs', 'run-collector.ps1', 'subject.mjs', 'validate-evidence.mjs', 'validate-evidence.test.mjs')
    if (@($config.files).Count -ne $requiredFiles.Count) { throw 'INPUT_INVENTORY' }
    foreach ($name in $requiredFiles) {
        if (@($config.files | Where-Object { $_.path -eq $name }).Count -ne 1) { throw "INPUT_INVENTORY:$name" }
    }
    $inputHashes = HashInputs $bundle $config.files
    $sourceRoot = CheckLocal $SourceRepositoryRoot
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot '.git')) -or -not (Within $sourceRoot $bundle)) { throw 'SOURCE_REPOSITORY_IDENTITY' }
    $scratchRoot = CheckLocal $Scratch
    if (-not (Test-Path -LiteralPath $scratchRoot -PathType Container)) { throw 'EXISTING_OWNED_SCRATCH_REQUIRED' }
    OutsideSource $sourceRoot $scratchRoot
    $run = Join-Path $scratchRoot ('collector-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $run | Out-Null
    $env:TEMP = $run
    $env:TMP = $run
    $env:NODE_OPTIONS = $null
    $env:NODE_PATH = $null
    $hostProcess = [System.Diagnostics.Process]::GetCurrentProcess()
    try { $hostImage = $hostProcess.MainModule.FileName } finally { $hostProcess.Dispose() }
    $automationImage = [System.Management.Automation.PowerShell].Assembly.Location
    $coreImage = [System.Object].Assembly.Location
    WriteJson (Join-Path $run 'host-runtime.json') ([ordered]@{
        executable = $hostImage; executableSha256 = Digest $hostImage
        powershellVersion = $PSVersionTable.PSVersion.ToString(); clrVersion = [Environment]::Version.ToString()
        automationAssembly = $automationImage; automationAssemblySha256 = Digest $automationImage
        coreAssembly = $coreImage; coreAssemblySha256 = Digest $coreImage
        command = [Environment]::GetCommandLineArgs()
        osVersionApiValue = [Environment]::OSVersion.Version.ToString()
        scope = 'host identity, not complete loaded-module or OS attestation'
    })
    Add-Type -LiteralPath (Join-Path $bundle 'NativeCollector.cs') -ErrorAction Stop
    WriteJson (Join-Path $run 'native-platform.json') ([CollectorOnlyPrototype.NativeCollector]::NativePlatform())
    $sourceRoot = CheckLocal ([CollectorOnlyPrototype.NativeCollector]::CanonicalDirectory($sourceRoot))
    $run = CheckLocal ([CollectorOnlyPrototype.NativeCollector]::CanonicalDirectory($run))
    OutsideSource $sourceRoot $run
    Set-Location -LiteralPath $run
    $isolationControls = @()
    foreach ($candidate in @($sourceRoot, (Join-Path $sourceRoot '.sdd'), (Join-Path $sourceRoot 'protected-child'))) {
        $refused = $false
        try { OutsideSource $sourceRoot $candidate } catch { $refused = $_.Exception.Message -eq 'PROTECTED_SOURCE_ROOT' }
        if (-not $refused) { throw 'ISOLATION_CONTROL_FAILED' }
        $isolationControls += [ordered]@{ control = 'protected-source'; detected = $true }
    }
    $uncRefused = $false
    try { CheckLocal '\\collector-invalid\share\case' | Out-Null } catch { $uncRefused = $_.Exception.Message -eq 'LOCAL_NTFS_REQUIRED' }
    if (-not $uncRefused) { throw 'UNC_CONTROL_FAILED' }
    $isolationControls += [ordered]@{ control = 'UNC'; detected = $true }
    $junction = Join-Path $run 'protected-junction'
    New-Item -ItemType Junction -Path $junction -Target $sourceRoot | Out-Null
    try {
        $junctionRefused = $false
        try { CheckLocal $junction | Out-Null } catch { $junctionRefused = $_.Exception.Message -eq 'REPARSE_POINT_REFUSED' }
        if (-not $junctionRefused) { throw 'JUNCTION_CONTROL_FAILED' }
        $isolationControls += [ordered]@{ control = 'owned-junction-to-source'; detected = $true }
    } finally { [CollectorOnlyPrototype.NativeCollector]::RemoveOwnedJunction($junction, $run) }
    WriteJson (Join-Path $run 'isolation-controls.json') $isolationControls
    $layout = [CollectorOnlyPrototype.NativeCollector]::Layout()
    WriteJson (Join-Path $run 'layout.json') $layout
    $results = @()
    foreach ($major in @(24, 22, 20)) {
        $lane = @($config.runtimes | Where-Object { $_.major -eq $major })
        if ($lane.Count -ne 1) { throw "RUNTIME_INVENTORY:$major" }
        $runtime = $lane[0]
        if ($runtime.version -notmatch "^v$major\.[0-9]+\.[0-9]+$" -or
            $runtime.url -ne "https://nodejs.org/dist/$($runtime.version)/node-$($runtime.version)-win-x64.zip") { throw 'OFFICIAL_ARCHIVE_IDENTITY' }
        $laneRoot = Join-Path $run "node$major"
        [System.IO.Directory]::CreateDirectory($laneRoot) | Out-Null
        $archive = Join-Path $laneRoot 'portable.zip'
        Invoke-WebRequest -UseBasicParsing -Uri $runtime.url -OutFile $archive
        if ((Digest $archive) -ne $runtime.archiveSha256) { throw 'ARCHIVE_CHECKSUM' }
        Expand-Archive -LiteralPath $archive -DestinationPath $laneRoot
        $executable = CheckLocal (Join-Path $laneRoot "node-$($runtime.version)-win-x64\node.exe")
        if ((Digest $executable) -ne $runtime.executableSha256) { throw 'EXECUTABLE_CHECKSUM' }
        $probe = & $executable -p 'JSON.stringify({version:process.version,platform:process.platform,arch:process.arch,executable:process.execPath})'
        if ($LASTEXITCODE -ne 0) { throw 'RUNTIME_PROBE_EXIT' }
        $identity = $probe | ConvertFrom-Json
        if ($identity.version -ne $runtime.version -or $identity.platform -ne 'win32' -or
            $identity.arch -ne 'x64' -or $identity.executable -ne $executable) { throw 'RUNTIME_PROBE_IDENTITY' }
        WriteJson (Join-Path $laneRoot 'runtime.json') $identity
        & $executable --test --test-reporter=spec (Join-Path $bundle 'validate-evidence.test.mjs') 1> (Join-Path $laneRoot 'validator-controls.stdout.txt') 2> (Join-Path $laneRoot 'validator-controls.stderr.txt')
        if ($LASTEXITCODE -ne 0) { throw 'VALIDATOR_CONTROL_FAILURE' }
        $case = Join-Path $laneRoot 'case'
        [System.IO.Directory]::CreateDirectory($case) | Out-Null
        $case = CheckLocal ([CollectorOnlyPrototype.NativeCollector]::CanonicalDirectory($case))
        OutsideSource $sourceRoot $case
        $isolation = [ordered]@{
            sourceRepositoryRoot = $sourceRoot; runRoot = $run; fixtureRoot = $case
            kernelPathsVerified = $true; reparseChecked = $true; uniqueRunOwned = $true; fixtureFresh = $true
        }
        $subject = Join-Path $bundle 'subject.mjs'
        $arguments = @($subject, 'root', $case)
        $native = [CollectorOnlyPrototype.NativeCollector]::Run($executable, $arguments, $case, $sourceRoot, 180000)
        WriteJson (Join-Path $case 'native-raw.json') $native
        $witnesses = @()
        foreach ($role in @('root', 'quick', 'nested', 'grandchild', 'allocator', 'survivor')) {
            $witnessFile = Join-Path $case "$role.json"
            if (Test-Path -LiteralPath $witnessFile) { $witnesses += Get-Content -LiteralPath $witnessFile -Raw | ConvertFrom-Json }
        }
        $expected = [ordered]@{
            manifestSha256 = $ManifestSha256
            files = $inputHashes
            executableSha256 = $runtime.executableSha256
            version = $runtime.version
            executable = $executable
            command = @($executable) + $arguments
            cwd = $case
            isolation = $isolation
        }
        $bindings = [ordered]@{
            manifestSha256 = Digest $manifestPath
            files = HashInputs $bundle $config.files
            executableSha256 = Digest $executable
            version = $identity.version
            executable = $identity.executable
            command = $native.command
            cwd = $native.cwd
            isolation = $isolation
        }
        $evidence = [ordered]@{
            schema = 1; kind = 'collector-only-prototype'
            platform = $identity.platform; arch = $identity.arch; version = $identity.version
            bindings = $bindings; native = $native; witnesses = $witnesses
        }
        $expectedPath = Join-Path $case 'expected.json'
        $evidencePath = Join-Path $case 'evidence.json'
        WriteJson $expectedPath $expected
        WriteJson $evidencePath $evidence
        $verdictText = & $executable (Join-Path $bundle 'validate-evidence.mjs') $evidencePath $expectedPath
        $verdictExit = $LASTEXITCODE
        [System.IO.File]::WriteAllText((Join-Path $case 'verdict.json'), ($verdictText -join "`n") + "`n", $utf8)
        $verdict = $verdictText | ConvertFrom-Json
        if ($verdictExit -eq 0 -and $verdict.status -eq 'PASS') {
            $controlsText = & $executable (Join-Path $bundle 'validate-evidence.mjs') $evidencePath $expectedPath --controls
            $controlsExit = $LASTEXITCODE
            [System.IO.File]::WriteAllText((Join-Path $case 'native-derived-controls.json'), ($controlsText -join "`n") + "`n", $utf8)
            if ($controlsExit -ne 0 -or ($controlsText | ConvertFrom-Json).status -ne 'PASS') { throw 'NATIVE_DERIVED_CONTROL_FAILURE' }
        }
        $artifacts = @()
        foreach ($name in @('stdout.txt', 'stderr.txt', 'native-raw.json', 'expected.json', 'evidence.json', 'verdict.json',
            'native-derived-controls.json', 'root-closed.json', 'root.json', 'quick.json', 'nested.json', 'grandchild.json', 'allocator.json', 'survivor.json')) {
            $artifact = Join-Path $case $name
            if (Test-Path -LiteralPath $artifact) { $artifacts += [ordered]@{ path = $name; sha256 = Digest $artifact } }
        }
        WriteJson (Join-Path $case 'artifacts.json') $artifacts
        $results += [ordered]@{ major = $major; status = $verdict.status; reasons = $verdict.reasons; case = $case }
        WriteJson (Join-Path $run 'summary.json') ([ordered]@{
            kind = 'COLLECTOR-ONLY-PROTOTYPE'; manifestSha256 = $ManifestSha256
            lanes = $results; qualification = 'NOT_RUN'; nextLaneAllowed = ($verdictExit -eq 0)
        })
        if ($verdictExit -ne 0 -or $verdict.status -ne 'PASS') { throw "NATIVE_CONTROL_NON_PASS:$major" }
    }
    Write-Output "COLLECTOR_ONLY_PROTOTYPE_CONTROLS_PASS artifacts=$run; full qualification NOT_RUN"
    exit 0
} catch {
    if ($run) {
        WriteJson (Join-Path $run 'failure.json') ([ordered]@{
            status = 'NON_PASS'; reason = $_.Exception.Message
            qualification = 'NOT_RUN'; artifactsRetained = $true
        })
    }
    Write-Error ("COLLECTOR_ONLY_NON_PASS: " + $_.Exception.Message) -ErrorAction Continue
    exit 2
} finally {
    $env:NODE_OPTIONS = $savedNodeOptions
    $env:NODE_PATH = $savedNodePath
    $env:TEMP = $savedTemp
    $env:TMP = $savedTmp
    Set-Location -LiteralPath $savedLocation.Path
}
