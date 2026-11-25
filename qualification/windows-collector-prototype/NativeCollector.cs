using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace CollectorOnlyPrototype
{
    public sealed class ProcessRow
    {
        public uint pid, parentPid, exitCode, initialThreadId;
        public string creationFileTime, exitFileTime, peakBytes, image;
        public bool peakAtHeldExit, exitContinued, signaled;
        public int initialBreakpointsHandled, exceptionCount;
        internal IntPtr ownedProcess;
        internal ulong verifiedStartupBase, verifiedStartupSize;
        public bool startupImageVerified, startupFileHandlePresent;
        public string startupImageIdentity, startupImageBase, startupImageSize, ownedHandleSource;
    }
    public sealed class ProcessEvent
    {
        public string kind, creationFileTime, exitFileTime, peakBytes;
        public uint pid;
        public bool peakAtHeldExit;
    }
    public sealed class DebugEventRecord
    {
        public uint code, pid, tid, exceptionCode, firstChance, continueStatus;
        public long elapsedMs;
        public bool continued;
        public bool startupBreakpointVerified;
        public string exceptionAddress;
        public string startupImageIdentity, startupImageBase, startupImageSize;
        public bool startupMappingRevalidated;
    }
    public sealed class CollectorRecord
    {
        public uint pid, parentPid;
        public string creationFileTime, observedFileTime, peakBytes, image, executableSha256, collectionStartFileTime, collectionEndFileTime;
        public string[] command;
        public string boundary = "host-process-peak-through-collection;not-full-overhead-tree";
    }
    public sealed class Collection
    {
        public List<ProcessRow> rows = new List<ProcessRow>();
        public List<ProcessEvent> processEvents = new List<ProcessEvent>();
        public List<DebugEventRecord> debugEvents = new List<DebugEventRecord>();
        public List<string> errors = new List<string>();
        public CollectorRecord collector;
        public bool timedOut, completed, cleanupComplete;
        public long elapsedMs;
        public uint jobTotalProcesses, jobActiveAtEnd;
        public string[] command;
        public string cwd;
        public string method = "DEBUG_PROCESS;PeakWorkingSetSize-at-held-EXIT_PROCESS_DEBUG_EVENT";
        public Dictionary<string, int> layout;
    }

    public static class NativeCollector
    {
        const uint DEBUG_PROCESS = 1, EXTENDED_STARTUPINFO_PRESENT = 0x80000, CREATE_NO_WINDOW = 0x08000000;
        const uint DBG_CONTINUE = 0x10002, DBG_EXCEPTION_NOT_HANDLED = 0x80010001;
        const uint BREAKPOINT = 0x80000003, WAIT_OBJECT_0 = 0, WAIT_TIMEOUT = 258;
        const uint DUPLICATE_SAME_ACCESS = 2, STARTF_USESTDHANDLES = 0x100;
        const uint KILL_ON_JOB_CLOSE = 0x2000;
        const uint OWNED_QUERY_READ_WAIT = 0x00100410;
        static readonly IntPtr INVALID = new IntPtr(-1);

        [StructLayout(LayoutKind.Sequential)] public struct FILETIME { public uint low, high; }
        [StructLayout(LayoutKind.Sequential)] struct SECURITY_ATTRIBUTES { public uint length; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct STARTUPINFO
        {
            public uint cb; public IntPtr reserved, desktop, title;
            public uint x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
            public ushort showWindow, reserved2; public IntPtr reservedBytes, stdin, stdout, stderr;
        }
        [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO startup; public IntPtr attributes; }
        [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr process, thread; public uint pid, tid; }
        [StructLayout(LayoutKind.Sequential)] public struct EXCEPTION_RECORD
        {
            public uint code, flags; public IntPtr record, address; public uint parameterCount;
            public UIntPtr p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14;
        }
        [StructLayout(LayoutKind.Sequential)] public struct EXCEPTION_DEBUG_INFO { public EXCEPTION_RECORD record; public uint firstChance; }
        [StructLayout(LayoutKind.Sequential)] public struct CREATE_PROCESS_DEBUG_INFO
        {
            public IntPtr file, process, thread, baseOfImage;
            public uint debugOffset, debugSize; public IntPtr threadLocalBase, startAddress, imageName; public ushort unicode;
        }
        [StructLayout(LayoutKind.Sequential)] internal struct CREATE_THREAD_DEBUG_INFO { public IntPtr thread, threadLocalBase, startAddress; }
        [StructLayout(LayoutKind.Sequential)] internal struct LOAD_DLL_DEBUG_INFO { public IntPtr file, baseOfDll; public uint debugOffset, debugSize; public IntPtr imageName; public ushort unicode; }
        [StructLayout(LayoutKind.Explicit, Size = 160)] public struct DEBUG_UNION
        {
            [FieldOffset(0)] public EXCEPTION_DEBUG_INFO exception;
            [FieldOffset(0)] public CREATE_PROCESS_DEBUG_INFO createProcess;
            [FieldOffset(0)] internal CREATE_THREAD_DEBUG_INFO createThread;
            [FieldOffset(0)] internal LOAD_DLL_DEBUG_INFO loadDll;
            [FieldOffset(0)] public uint exitCode;
            [FieldOffset(0)] public IntPtr unloadDllBase;
        }
        [StructLayout(LayoutKind.Sequential)] public struct DEBUG_EVENT { public uint code, pid, tid; public DEBUG_UNION data; }
        [StructLayout(LayoutKind.Sequential)] public struct PROCESS_MEMORY_COUNTERS_EX
        {
            public uint cb, pageFaultCount;
            public UIntPtr peakWorkingSet, workingSet, quotaPeakPaged, quotaPaged, quotaPeakNonPaged, quotaNonPaged, pagefile, peakPagefile, privateUsage;
        }
        [StructLayout(LayoutKind.Sequential)] public struct PROCESS_BASIC_INFORMATION
        {
            public int exitStatus; public IntPtr peb; public UIntPtr affinity; public int basePriority; public UIntPtr pid, parentPid;
        }
        [StructLayout(LayoutKind.Sequential)] public struct MEMORY_BASIC_INFORMATION
        {
            public IntPtr baseAddress, allocationBase; public uint allocationProtect; public ushort partitionId;
            public UIntPtr regionSize; public uint state, protect, type;
        }
        sealed class ImageHeader
        {
            public uint offset, size, stamp, checksum;
        }
        [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT
        {
            public long processUserTime, jobUserTime; public uint flags; public UIntPtr minimumWorkingSet, maximumWorkingSet;
            public uint activeProcesses; public UIntPtr affinity; public uint priorityClass, schedulingClass;
        }
        [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOperations, writeOperations, otherOperations, readBytes, writeBytes, otherBytes; }
        [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic; public IO_COUNTERS io; public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory; }
        [StructLayout(LayoutKind.Sequential)] struct BASIC_ACCOUNTING
        {
            public long totalUser, totalKernel, periodUser, periodKernel;
            public uint pageFaults, totalProcesses, activeProcesses, terminatedProcesses;
        }
        [UnmanagedFunctionPointer(CallingConvention.Winapi)] delegate int QueryProcess(IntPtr process, int informationClass, out PROCESS_BASIC_INFORMATION information, uint length, out uint returned);

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity,
            bool inheritHandles, uint flags, IntPtr environment, string cwd, ref STARTUPINFOEX startup, out PROCESS_INFORMATION information);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool WaitForDebugEvent(out DEBUG_EVENT debugEvent, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool ContinueDebugEvent(uint pid, uint tid, uint status);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] static extern uint GetCurrentProcessId();
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool IsWow64Process2(IntPtr process, out ushort processMachine, out ushort nativeMachine);
        [DllImport("kernel32.dll", SetLastError = true)] static extern uint GetProcessId(IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint K32GetMappedFileNameW(IntPtr process, IntPtr address, StringBuilder name, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, out MEMORY_BASIC_INFORMATION information, UIntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, [Out] byte[] data, UIntPtr size, out UIntPtr read);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out FILETIME creation, out FILETIME exit, out FILETIME kernel, out FILETIME user);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool K32GetProcessMemoryInfo(IntPtr process, out PROCESS_MEMORY_COUNTERS_EX counters, uint size);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder name, ref uint size);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr GetModuleHandleW(string module);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern uint GetFinalPathNameByHandleW(IntPtr file, StringBuilder name, uint size, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool RemoveDirectoryW(string name);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, ExactSpelling = true, SetLastError = true)] static extern IntPtr GetProcAddress(IntPtr module, string name);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateFileW(string file, uint access, uint sharing, ref SECURITY_ATTRIBUTES security, uint disposition, uint attributes, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
        [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr security, string name);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int informationClass, ref EXTENDED_LIMIT information, uint size);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int informationClass, out BASIC_ACCOUNTING information, uint size, IntPtr returned);
        [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

        static string Decimal(ulong value) { return value.ToString(CultureInfo.InvariantCulture); }
        static ulong Time(FILETIME value) { return ((ulong)value.high << 32) | value.low; }
        static void Require(bool condition, string operation) { if (!condition) throw new InvalidOperationException(operation + ":" + Marshal.GetLastWin32Error()); }
        static void CloseOwned(ref IntPtr handle)
        {
            if (handle != IntPtr.Zero && handle != INVALID) { IntPtr value = handle; handle = IntPtr.Zero; Require(CloseHandle(value), "CLOSE_OWNED"); }
        }
        static string Image(IntPtr process)
        {
            uint size = 32768; StringBuilder name = new StringBuilder((int)size);
            Require(QueryFullProcessImageNameW(process, 0, name, ref size), "IMAGE_API"); return name.ToString();
        }
        static string Creation(IntPtr process)
        {
            FILETIME created, exit, kernel, user;
            Require(GetProcessTimes(process, out created, out exit, out kernel, out user), "CREATION_API");
            Require(Time(created) != 0, "CREATION_ZERO"); return Decimal(Time(created));
        }
        static string Peak(IntPtr process)
        {
            PROCESS_MEMORY_COUNTERS_EX memory;
            Require(K32GetProcessMemoryInfo(process, out memory, (uint)Marshal.SizeOf(typeof(PROCESS_MEMORY_COUNTERS_EX))), "MEMORY_API");
            Require(memory.peakWorkingSet.ToUInt64() != 0, "MEMORY_ZERO");
            return Decimal(memory.peakWorkingSet.ToUInt64());
        }
        public static bool IsInitialBreakpoint(int exceptionCount, uint firstChance, uint exceptionCode,
            uint threadId, uint initialThreadId, ulong address, bool mappingVerified, ulong imageBase, ulong imageSize)
        {
            return exceptionCount == 0 && firstChance != 0 && exceptionCode == BREAKPOINT
                && initialThreadId != 0 && threadId == initialThreadId && mappingVerified
                && imageBase != 0 && imageSize != 0 && imageSize <= ulong.MaxValue - imageBase
                && address >= imageBase && address < imageBase + imageSize;
        }
        static IntPtr Address(ulong address) { return new IntPtr(unchecked((long)address)); }
        static string MappedImageName(IntPtr process, ulong address)
        {
            StringBuilder name = new StringBuilder(32768);
            uint length = K32GetMappedFileNameW(process, Address(address), name, 32768);
            Require(length > 0 && length < 32768, "MAPPED_NAME_API");
            return name.ToString();
        }
        static void VerifyImagePage(IntPtr process, ulong address, ulong imageBase)
        {
            MEMORY_BASIC_INFORMATION page;
            Require(VirtualQueryEx(process, Address(address), out page, new UIntPtr(48)).ToUInt64() == 48, "MAPPED_PAGE_API");
            ulong start = unchecked((ulong)page.baseAddress.ToInt64()), size = page.regionSize.ToUInt64();
            Require(page.state == 0x1000 && page.type == 0x1000000
                && unchecked((ulong)page.allocationBase.ToInt64()) == imageBase && size > 0
                && size <= ulong.MaxValue - start && address >= start && address < start + size, "MAPPED_IMAGE_PAGE");
        }
        static byte[] ReadImageBytes(IntPtr process, ulong imageBase, ulong address, uint size)
        {
            Require(size > 0 && size <= 4096 && address > 0 && size - 1 <= ulong.MaxValue - address, "IMAGE_READ_RANGE");
            VerifyImagePage(process, address, imageBase); VerifyImagePage(process, address + size - 1, imageBase);
            byte[] bytes = new byte[size]; UIntPtr read;
            Require(ReadProcessMemory(process, Address(address), bytes, new UIntPtr(size), out read)
                && read.ToUInt64() == size, "IMAGE_READ_API");
            return bytes;
        }
        static ImageHeader ReadImageHeader(IntPtr process, ulong imageBase)
        {
            byte[] dos = ReadImageBytes(process, imageBase, imageBase, 64);
            uint offset = BitConverter.ToUInt32(dos, 60);
            Require(BitConverter.ToUInt16(dos, 0) == 0x5a4d && offset >= 64 && offset <= 1048576
                && offset <= ulong.MaxValue - imageBase, "IMAGE_DOS_HEADER");
            byte[] pe = ReadImageBytes(process, imageBase, imageBase + offset, 92);
            uint size = BitConverter.ToUInt32(pe, 80);
            Require(BitConverter.ToUInt32(pe, 0) == 0x00004550 && BitConverter.ToUInt16(pe, 4) == 0x8664
                && BitConverter.ToUInt16(pe, 20) >= 68 && BitConverter.ToUInt16(pe, 24) == 0x20b
                && size > offset + 92 && size <= 0x80000000 && size <= ulong.MaxValue - imageBase, "IMAGE_PE_HEADER");
            return new ImageHeader { offset = offset, size = size, stamp = BitConverter.ToUInt32(pe, 8), checksum = BitConverter.ToUInt32(pe, 88) };
        }
        static ImageHeader VerifyStartupImage(IntPtr process, ulong imageBase, string identity, ImageHeader local)
        {
            Require(String.Equals(MappedImageName(process, imageBase), identity, StringComparison.OrdinalIgnoreCase), "STARTUP_IMAGE_IDENTITY");
            ImageHeader remote = ReadImageHeader(process, imageBase);
            Require(remote.offset == local.offset && remote.size == local.size
                && remote.stamp == local.stamp && remote.checksum == local.checksum, "STARTUP_IMAGE_HEADER");
            return remote;
        }
        public static string Quote(string argument)
        {
            StringBuilder result = new StringBuilder("\""); int slashes = 0;
            foreach (char value in argument)
            {
                if (value == '\\') { slashes++; continue; }
                if (value == '"') result.Append('\\', slashes * 2 + 1);
                else result.Append('\\', slashes);
                result.Append(value); slashes = 0;
            }
            result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
        }
        public static Dictionary<string, int> Layout()
        {
            Dictionary<string, int> actual = new Dictionary<string, int>();
            actual["DEBUG_EVENT"] = Marshal.SizeOf(typeof(DEBUG_EVENT));
            actual["DEBUG_EVENT.union"] = Marshal.OffsetOf(typeof(DEBUG_EVENT), "data").ToInt32();
            actual["EXCEPTION_RECORD"] = Marshal.SizeOf(typeof(EXCEPTION_RECORD));
            actual["EXCEPTION_RECORD.parameters"] = Marshal.OffsetOf(typeof(EXCEPTION_RECORD), "p0").ToInt32();
            actual["EXCEPTION_DEBUG_INFO"] = Marshal.SizeOf(typeof(EXCEPTION_DEBUG_INFO));
            actual["EXCEPTION_DEBUG_INFO.firstChance"] = Marshal.OffsetOf(typeof(EXCEPTION_DEBUG_INFO), "firstChance").ToInt32();
            actual["CREATE_PROCESS_DEBUG_INFO"] = Marshal.SizeOf(typeof(CREATE_PROCESS_DEBUG_INFO));
            actual["PROCESS_MEMORY_COUNTERS_EX"] = Marshal.SizeOf(typeof(PROCESS_MEMORY_COUNTERS_EX));
            actual["PROCESS_MEMORY_COUNTERS_EX.peak"] = Marshal.OffsetOf(typeof(PROCESS_MEMORY_COUNTERS_EX), "peakWorkingSet").ToInt32();
            actual["PROCESS_BASIC_INFORMATION"] = Marshal.SizeOf(typeof(PROCESS_BASIC_INFORMATION));
            actual["PROCESS_BASIC_INFORMATION.parent"] = Marshal.OffsetOf(typeof(PROCESS_BASIC_INFORMATION), "parentPid").ToInt32();
            actual["STARTUPINFOEX"] = Marshal.SizeOf(typeof(STARTUPINFOEX));
            actual["EXTENDED_LIMIT"] = Marshal.SizeOf(typeof(EXTENDED_LIMIT));
            actual["MEMORY_BASIC_INFORMATION"] = Marshal.SizeOf(typeof(MEMORY_BASIC_INFORMATION));
            actual["MEMORY_BASIC_INFORMATION.region"] = Marshal.OffsetOf(typeof(MEMORY_BASIC_INFORMATION), "regionSize").ToInt32();
            string[] keys = { "DEBUG_EVENT", "DEBUG_EVENT.union", "EXCEPTION_RECORD", "EXCEPTION_RECORD.parameters", "EXCEPTION_DEBUG_INFO",
                "EXCEPTION_DEBUG_INFO.firstChance", "CREATE_PROCESS_DEBUG_INFO", "PROCESS_MEMORY_COUNTERS_EX", "PROCESS_MEMORY_COUNTERS_EX.peak",
                "PROCESS_BASIC_INFORMATION", "PROCESS_BASIC_INFORMATION.parent", "STARTUPINFOEX", "EXTENDED_LIMIT",
                "MEMORY_BASIC_INFORMATION", "MEMORY_BASIC_INFORMATION.region" };
            int[] expected = { 176, 16, 152, 32, 160, 152, 72, 80, 8, 48, 40, 112, 144, 48, 24 };
            Require(IntPtr.Size == 8, "X64_REQUIRED");
            for (int i = 0; i < keys.Length; i++) Require(actual[keys[i]] == expected[i], "LAYOUT_" + keys[i]);
            return actual;
        }
        public static Dictionary<string, int> NativePlatform()
        {
            ushort processMachine, nativeMachine;
            Require(IsWow64Process2(GetCurrentProcess(), out processMachine, out nativeMachine), "NATIVE_ARCH_API");
            Require(processMachine == 0 && nativeMachine == 0x8664, "NATIVE_WINDOWS_X64_REQUIRED");
            return new Dictionary<string, int> { { "processMachine", processMachine }, { "nativeMachine", nativeMachine } };
        }
        static IntPtr Output(string name, bool input)
        {
            SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES();
            security.length = (uint)Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES)); security.inherit = true;
            IntPtr handle = CreateFileW(name, input ? 0x80000000 : 0x40000000, 7, ref security, input ? 3u : 2u, 0x80, IntPtr.Zero);
            Require(handle != INVALID && handle != IntPtr.Zero, "STDIO_OPEN"); return handle;
        }
        public static string CanonicalDirectory(string name)
        {
            SECURITY_ATTRIBUTES security = new SECURITY_ATTRIBUTES();
            security.length = (uint)Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
            IntPtr handle = CreateFileW(name, 0, 7, ref security, 3, 0x02000000, IntPtr.Zero);
            Require(handle != INVALID && handle != IntPtr.Zero, "DIRECTORY_OPEN");
            try
            {
                StringBuilder canonical = new StringBuilder(32768);
                uint count = GetFinalPathNameByHandleW(handle, canonical, 32768, 0);
                Require(count > 0 && count < 32768, "DIRECTORY_CANONICAL");
                string full = canonical.ToString();
                if (full.StartsWith(@"\\?\", StringComparison.Ordinal)) full = full.Substring(4);
                return full;
            }
            finally { CloseOwned(ref handle); }
        }
        public static void RemoveOwnedJunction(string name, string ownedRoot)
        {
            string parent = CanonicalDirectory(Path.GetDirectoryName(name));
            Require(String.Equals(parent, CanonicalDirectory(ownedRoot), StringComparison.OrdinalIgnoreCase)
                && (File.GetAttributes(name) & FileAttributes.ReparsePoint) != 0, "JUNCTION_OWNERSHIP");
            Require(RemoveDirectoryW(name), "OWNED_JUNCTION_REMOVE");
        }
        static void FinalizeExit(ProcessRow row, Collection report)
        {
            if (!row.exitContinued || row.signaled) return;
            uint wait = WaitForSingleObject(row.ownedProcess, 0);
            if (wait == WAIT_TIMEOUT) return;
            Require(wait == WAIT_OBJECT_0, "EXIT_WAIT");
            FILETIME created, exited, kernel, user;
            Require(GetProcessTimes(row.ownedProcess, out created, out exited, out kernel, out user), "EXIT_TIME_API");
            Require(Decimal(Time(created)) == row.creationFileTime && Time(exited) >= Time(created), "EXIT_TIME_IDENTITY");
            row.exitFileTime = Decimal(Time(exited)); row.signaled = true;
            foreach (ProcessEvent entry in report.processEvents)
                if (entry.kind == "exit" && entry.pid == row.pid && entry.creationFileTime == row.creationFileTime) entry.exitFileTime = row.exitFileTime;
        }
        static bool AllClosed(Collection report)
        {
            if (report.rows.Count == 0) return false;
            foreach (ProcessRow row in report.rows) if (!row.signaled) return false;
            return true;
        }
        static bool JobClosed(IntPtr job, Collection report)
        {
            BASIC_ACCOUNTING accounting;
            Require(QueryInformationJobObject(job, 1, out accounting, (uint)Marshal.SizeOf(typeof(BASIC_ACCOUNTING)), IntPtr.Zero), "OWNED_JOB_CLOSURE");
            report.jobTotalProcesses = accounting.totalProcesses; report.jobActiveAtEnd = accounting.activeProcesses;
            return accounting.activeProcesses == 0;
        }
        public static Collection Run(string executable, string[] arguments, string cwd, string sourceRepositoryRoot, int timeoutMs)
        {
            Collection report = new Collection(); Stopwatch clock = Stopwatch.StartNew();
            string collectionStart = Decimal((ulong)DateTime.UtcNow.ToFileTimeUtc());
            List<string> argv = new List<string>(); argv.Add(executable); argv.AddRange(arguments);
            report.command = argv.ToArray(); report.cwd = cwd;
            IntPtr job = IntPtr.Zero, input = IntPtr.Zero, output = IntPtr.Zero, error = IntPtr.Zero, ownedRoot = IntPtr.Zero;
            IntPtr attributes = IntPtr.Zero, handleList = IntPtr.Zero; bool attributesInitialized = false, launched = false, assigned = false, abort = false;
            PROCESS_INFORMATION information = new PROCESS_INFORMATION();
            Dictionary<uint, ProcessRow> active = new Dictionary<uint, ProcessRow>();
            bool rootMarkerWritten = false;
            try
            {
                Require(timeoutMs > 0 && timeoutMs <= 180000, "TIMEOUT_ARGUMENT");
                report.layout = Layout();
                NativePlatform();
                Require(!cwd.StartsWith(@"\\", StringComparison.Ordinal) && !sourceRepositoryRoot.StartsWith(@"\\", StringComparison.Ordinal)
                    && !cwd.StartsWith("//", StringComparison.Ordinal) && !sourceRepositoryRoot.StartsWith("//", StringComparison.Ordinal), "LOCAL_NTFS_REQUIRED");
                cwd = CanonicalDirectory(cwd); report.cwd = cwd;
                string protectedRoot = CanonicalDirectory(sourceRepositoryRoot).TrimEnd('\\');
                Require(!String.Equals(cwd, protectedRoot, StringComparison.OrdinalIgnoreCase)
                    && !cwd.StartsWith(protectedRoot + "\\", StringComparison.OrdinalIgnoreCase)
                    && !protectedRoot.StartsWith(cwd.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase), "PROTECTED_SOURCE_ROOT");
                IntPtr queryAddress = GetProcAddress(GetModuleHandleW("ntdll.dll"), "NtQueryInformationProcess");
                Require(queryAddress != IntPtr.Zero, "PARENT_API_UNAVAILABLE");
                QueryProcess query = (QueryProcess)Marshal.GetDelegateForFunctionPointer(queryAddress, typeof(QueryProcess));
                IntPtr ntdll = GetModuleHandleW("ntdll.dll");
                Require(ntdll != IntPtr.Zero, "STARTUP_MODULE_UNAVAILABLE");
                ulong localBase = unchecked((ulong)ntdll.ToInt64());
                string startupIdentity = MappedImageName(GetCurrentProcess(), localBase);
                ImageHeader startupHeader = ReadImageHeader(GetCurrentProcess(), localBase);
                input = Output("NUL", true); output = Output(Path.Combine(cwd, "stdout.txt"), false); error = Output(Path.Combine(cwd, "stderr.txt"), false);
                job = CreateJobObjectW(IntPtr.Zero, null); Require(job != IntPtr.Zero, "JOB_CREATE");
                EXTENDED_LIMIT limit = new EXTENDED_LIMIT(); limit.basic.flags = KILL_ON_JOB_CLOSE;
                Require(SetInformationJobObject(job, 9, ref limit, (uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT))), "JOB_CLEANUP_SETUP");
                IntPtr attributeSize = IntPtr.Zero;
                bool sized = InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeSize);
                Require(!sized && Marshal.GetLastWin32Error() == 122 && attributeSize.ToInt64() > 0, "ATTRIBUTE_SIZE");
                attributes = Marshal.AllocHGlobal(attributeSize);
                Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref attributeSize), "ATTRIBUTE_INIT"); attributesInitialized = true;
                handleList = Marshal.AllocHGlobal(IntPtr.Size * 3);
                Marshal.WriteIntPtr(handleList, 0, input); Marshal.WriteIntPtr(handleList, IntPtr.Size, output); Marshal.WriteIntPtr(handleList, IntPtr.Size * 2, error);
                Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handleList, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero), "HANDLE_LIST");
                STARTUPINFOEX startup = new STARTUPINFOEX();
                startup.startup.cb = (uint)Marshal.SizeOf(typeof(STARTUPINFOEX)); startup.startup.flags = STARTF_USESTDHANDLES;
                startup.startup.stdin = input; startup.startup.stdout = output; startup.startup.stderr = error; startup.attributes = attributes;
                StringBuilder command = new StringBuilder(Quote(executable));
                foreach (string argument in arguments) command.Append(" ").Append(Quote(argument));
                Require(CreateProcessW(executable, command, IntPtr.Zero, IntPtr.Zero, true,
                    DEBUG_PROCESS | EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW, IntPtr.Zero, cwd, ref startup, out information), "CREATE_PROCESS");
                launched = true;
                Require(DuplicateHandle(GetCurrentProcess(), information.process, GetCurrentProcess(),
                    out ownedRoot, 0, false, DUPLICATE_SAME_ACCESS), "ROOT_DUPLICATE");
                Require(AssignProcessToJobObject(job, ownedRoot), "OWNED_JOB_ASSIGN");
                assigned = true;
                CloseOwned(ref input); CloseOwned(ref output); CloseOwned(ref error);
                long cleanupDeadline = long.MaxValue;
                while (true)
                {
                    foreach (ProcessRow row in report.rows) FinalizeExit(row, report);
                    foreach (ProcessRow row in report.rows)
                    {
                        if (row.pid == information.pid && row.signaled && !rootMarkerWritten)
                        {
                            using (FileStream marker = new FileStream(Path.Combine(cwd, "root-closed.json"), FileMode.CreateNew, FileAccess.Write))
                            using (StreamWriter writer = new StreamWriter(marker, new UTF8Encoding(false)))
                                writer.Write("{\"pid\":" + row.pid + ",\"creationFileTime\":\"" + row.creationFileTime
                                    + "\",\"exitFileTime\":\"" + row.exitFileTime + "\"}\n");
                            rootMarkerWritten = true;
                        }
                    }
                    if (AllClosed(report) && active.Count == 0 && JobClosed(job, report))
                    {
                        if (report.jobTotalProcesses != report.rows.Count) report.errors.Add("JOB_CENSUS_MISMATCH");
                        report.completed = !abort; report.cleanupComplete = true; break;
                    }
                    if (!abort && (clock.ElapsedMilliseconds >= timeoutMs || report.debugEvents.Count >= 10000))
                    {
                        report.timedOut = clock.ElapsedMilliseconds >= timeoutMs;
                        report.errors.Add(report.timedOut ? "TIMEOUT" : "EVENT_LIMIT");
                        abort = true; cleanupDeadline = clock.ElapsedMilliseconds + 10000;
                        Require(TerminateJobObject(job, 19), "OWNED_JOB_TERMINATE");
                    }
                    if (abort && clock.ElapsedMilliseconds >= cleanupDeadline) { report.errors.Add("CLEANUP_DEADLINE"); break; }
                    DEBUG_EVENT next;
                    if (!WaitForDebugEvent(out next, 20))
                    {
                        int code = Marshal.GetLastWin32Error();
                        if (code == 121) continue;
                        throw new InvalidOperationException("DEBUG_WAIT:" + code);
                    }
                    DebugEventRecord eventRecord = new DebugEventRecord();
                    eventRecord.code = next.code; eventRecord.pid = next.pid; eventRecord.tid = next.tid; eventRecord.elapsedMs = clock.ElapsedMilliseconds;
                    report.debugEvents.Add(eventRecord); uint continuation = DBG_CONTINUE;
                    ProcessRow exiting = null;
                    try
                    {
                        if (next.code == 3)
                        {
                            if (next.pid == information.pid)
                            {
                                if (information.process == next.data.createProcess.process) information.process = IntPtr.Zero;
                                else CloseOwned(ref information.process);
                                if (information.thread == next.data.createProcess.thread) information.thread = IntPtr.Zero;
                                else CloseOwned(ref information.thread);
                            }
                            IntPtr file = next.data.createProcess.file;
                            CloseOwned(ref file);
                            Require(!active.ContainsKey(next.pid), "DUPLICATE_LIVE_PID");
                            ProcessRow row = new ProcessRow(); row.pid = next.pid; row.initialThreadId = next.tid;
                            if (next.pid == information.pid)
                            {
                                Require(DuplicateHandle(GetCurrentProcess(), ownedRoot, GetCurrentProcess(),
                                    out row.ownedProcess, 0, false, DUPLICATE_SAME_ACCESS), "PROCESS_DUPLICATE");
                                row.ownedHandleSource = "CreateProcess-owned-root-duplicate;documented-ALL_ACCESS";
                            }
                            else
                            {
                                row.ownedProcess = OpenProcess(OWNED_QUERY_READ_WAIT, false, next.pid);
                                Require(row.ownedProcess != IntPtr.Zero, "OWNED_CREATE_QUERY_READ_WAIT");
                                row.ownedHandleSource = "OpenProcess-held-DEBUG_PROCESS-create-PID;QUERY_INFORMATION|VM_READ|SYNCHRONIZE";
                            }
                            report.rows.Add(row); active.Add(row.pid, row);
                            Require(GetProcessId(row.ownedProcess) == next.pid, "HANDLE_PID");
                            PROCESS_BASIC_INFORMATION basic; uint returned;
                            int status = query(row.ownedProcess, 0, out basic, (uint)Marshal.SizeOf(typeof(PROCESS_BASIC_INFORMATION)), out returned);
                            Require(status == 0 && returned == 48 && basic.pid.ToUInt64() == next.pid, "PARENT_QUERY_" + status);
                            Require(basic.parentPid.ToUInt64() > 0 && basic.parentPid.ToUInt64() <= uint.MaxValue, "PARENT_ID");
                            row.parentPid = (uint)basic.parentPid.ToUInt64(); row.creationFileTime = Creation(row.ownedProcess); row.image = Image(row.ownedProcess);
                            if (row.pid == information.pid) Require(row.parentPid == GetCurrentProcessId(), "ROOT_BOUNDARY");
                            else Require(active.ContainsKey(row.parentPid), "DESCENDANT_BOUNDARY");
                            report.processEvents.Add(new ProcessEvent { kind = "create", pid = row.pid, creationFileTime = row.creationFileTime });
                        }
                        else if (next.code == 5)
                        {
                            Require(active.ContainsKey(next.pid), "EXIT_WITHOUT_BIRTH"); exiting = active[next.pid];
                            exiting.exitCode = next.data.exitCode;
                            try { exiting.peakBytes = Peak(exiting.ownedProcess); exiting.peakAtHeldExit = true; }
                            catch (Exception failure) { report.errors.Add(failure.Message); }
                            report.processEvents.Add(new ProcessEvent { kind = "exit", pid = exiting.pid, creationFileTime = exiting.creationFileTime,
                                peakBytes = exiting.peakBytes, peakAtHeldExit = exiting.peakAtHeldExit });
                        }
                        else if (next.code == 6)
                        {
                            IntPtr file = next.data.loadDll.file;
                            try
                            {
                                Require(active.ContainsKey(next.pid), "DLL_WITHOUT_BIRTH");
                                ProcessRow row = active[next.pid];
                                ulong remoteBase = unchecked((ulong)next.data.loadDll.baseOfDll.ToInt64());
                                if (String.Equals(MappedImageName(row.ownedProcess, remoteBase), startupIdentity, StringComparison.OrdinalIgnoreCase))
                                {
                                    Require(!row.startupImageVerified, "DUPLICATE_STARTUP_IMAGE");
                                    ImageHeader remote = VerifyStartupImage(row.ownedProcess, remoteBase, startupIdentity, startupHeader);
                                    row.verifiedStartupBase = remoteBase; row.verifiedStartupSize = remote.size;
                                    row.startupImageIdentity = startupIdentity; row.startupImageBase = Decimal(remoteBase); row.startupImageSize = Decimal(remote.size);
                                    row.startupFileHandlePresent = file != IntPtr.Zero && file != INVALID; row.startupImageVerified = true;
                                }
                            }
                            finally { CloseOwned(ref file); }
                        }
                        else if (next.code == 1)
                        {
                            continuation = DBG_EXCEPTION_NOT_HANDLED;
                            eventRecord.exceptionCode = next.data.exception.record.code; eventRecord.firstChance = next.data.exception.firstChance;
                            eventRecord.exceptionAddress = Decimal((ulong)next.data.exception.record.address.ToInt64());
                            Require(active.ContainsKey(next.pid), "EXCEPTION_WITHOUT_BIRTH");
                            ProcessRow row = active[next.pid];
                            ulong address = unchecked((ulong)next.data.exception.record.address.ToInt64());
                            bool initial = IsInitialBreakpoint(row.exceptionCount, eventRecord.firstChance, eventRecord.exceptionCode,
                                next.tid, row.initialThreadId, address, row.startupImageVerified, row.verifiedStartupBase, row.verifiedStartupSize);
                            row.exceptionCount++;
                            if (initial)
                            {
                                Require(GetProcessId(row.ownedProcess) == row.pid && Creation(row.ownedProcess) == row.creationFileTime, "STARTUP_PROCESS_IDENTITY");
                                ImageHeader remote = VerifyStartupImage(row.ownedProcess, row.verifiedStartupBase, startupIdentity, startupHeader);
                                Require(remote.size == row.verifiedStartupSize, "STARTUP_IMAGE_CHANGED");
                                VerifyImagePage(row.ownedProcess, address, row.verifiedStartupBase);
                                Require(String.Equals(MappedImageName(row.ownedProcess, address), startupIdentity, StringComparison.OrdinalIgnoreCase), "STARTUP_ADDRESS_IDENTITY");
                                eventRecord.startupImageIdentity = startupIdentity; eventRecord.startupImageBase = Decimal(row.verifiedStartupBase);
                                eventRecord.startupImageSize = Decimal(row.verifiedStartupSize); eventRecord.startupMappingRevalidated = true;
                                eventRecord.startupBreakpointVerified = true; continuation = DBG_CONTINUE; row.initialBreakpointsHandled++;
                            }
                            else if (row.exceptionCount == 1 && eventRecord.exceptionCode == BREAKPOINT) report.errors.Add("STARTUP_BREAKPOINT_UNVERIFIED");
                            if (eventRecord.firstChance == 0) report.errors.Add("UNHANDLED_EXCEPTION:" + eventRecord.exceptionCode);
                        }
                        else if (next.code == 7)
                        {
                            Require(active.ContainsKey(next.pid), "UNLOAD_WITHOUT_BIRTH");
                            ProcessRow row = active[next.pid];
                            if (unchecked((ulong)next.data.unloadDllBase.ToInt64()) == row.verifiedStartupBase) row.startupImageVerified = false;
                        }
                        else if (next.code == 9) report.errors.Add("RIP_EVENT");
                        else Require(next.code == 2 || next.code == 4 || next.code == 7 || next.code == 8, "UNKNOWN_EVENT");
                    }
                    finally
                    {
                        eventRecord.continueStatus = continuation;
                        eventRecord.continued = ContinueDebugEvent(next.pid, next.tid, continuation);
                        Require(eventRecord.continued, "DEBUG_CONTINUE");
                        if (exiting != null) { exiting.exitContinued = true; active.Remove(exiting.pid); }
                    }
                }
            }
            catch (Exception failure)
            {
                report.errors.Add(failure.Message);
                if (launched && job != IntPtr.Zero)
                {
                    bool terminated = assigned ? TerminateJobObject(job, 19)
                        : TerminateProcess(ownedRoot != IntPtr.Zero ? ownedRoot : information.process, 19);
                    if (!terminated) report.errors.Add("ABORT_OWNED:" + Marshal.GetLastWin32Error());
                    Stopwatch cleanup = Stopwatch.StartNew();
                    while (cleanup.ElapsedMilliseconds < 10000)
                    {
                        DEBUG_EVENT next;
                        if (WaitForDebugEvent(out next, 20))
                        {
                            if (next.code == 3 && next.pid == information.pid)
                            {
                                if (information.process == next.data.createProcess.process) information.process = IntPtr.Zero;
                                else { try { CloseOwned(ref information.process); } catch (Exception e) { report.errors.Add(e.Message); } }
                                if (information.thread == next.data.createProcess.thread) information.thread = IntPtr.Zero;
                                else { try { CloseOwned(ref information.thread); } catch (Exception e) { report.errors.Add(e.Message); } }
                            }
                            if (next.code == 3) { IntPtr file = next.data.createProcess.file; try { CloseOwned(ref file); } catch (Exception e) { report.errors.Add(e.Message); } }
                            if (next.code == 6) { IntPtr file = next.data.loadDll.file; try { CloseOwned(ref file); } catch (Exception e) { report.errors.Add(e.Message); } }
                            if (!ContinueDebugEvent(next.pid, next.tid, next.code == 1 ? DBG_EXCEPTION_NOT_HANDLED : DBG_CONTINUE))
                                report.errors.Add("ABORT_CONTINUE:" + Marshal.GetLastWin32Error());
                        }
                        bool closed = ownedRoot != IntPtr.Zero && WaitForSingleObject(ownedRoot, 0) == WAIT_OBJECT_0;
                        foreach (ProcessRow row in report.rows) closed &= WaitForSingleObject(row.ownedProcess, 0) == WAIT_OBJECT_0;
                        if (closed && JobClosed(job, report)) { report.cleanupComplete = true; break; }
                    }
                    if (!report.cleanupComplete) report.errors.Add("ABORT_CLEANUP_UNKNOWN");
                }
            }
            finally
            {
                foreach (ProcessRow row in report.rows)
                    try { CloseOwned(ref row.ownedProcess); } catch (Exception e) { report.errors.Add(e.Message); }
                IntPtr[] owned = { information.thread, information.process, input, output, error, ownedRoot, job };
                foreach (IntPtr value in owned) { IntPtr handle = value; try { CloseOwned(ref handle); } catch (Exception e) { report.errors.Add(e.Message); } }
                if (attributesInitialized) DeleteProcThreadAttributeList(attributes);
                if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
                if (handleList != IntPtr.Zero) Marshal.FreeHGlobal(handleList);
                try
                {
                    string selfImage = Image(GetCurrentProcess());
                    string selfHash;
                    using (SHA256 hash = SHA256.Create())
                    using (FileStream stream = File.OpenRead(selfImage))
                        selfHash = BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                    QueryProcess query = (QueryProcess)Marshal.GetDelegateForFunctionPointer(
                        GetProcAddress(GetModuleHandleW("ntdll.dll"), "NtQueryInformationProcess"), typeof(QueryProcess));
                    PROCESS_BASIC_INFORMATION basic; uint returned;
                    Require(query(GetCurrentProcess(), 0, out basic, 48, out returned) == 0 && returned == 48
                        && basic.pid.ToUInt64() == GetCurrentProcessId() && basic.parentPid.ToUInt64() <= uint.MaxValue, "COLLECTOR_PARENT");
                    string collectionEnd = Decimal((ulong)DateTime.UtcNow.ToFileTimeUtc());
                    report.collector = new CollectorRecord { pid = GetCurrentProcessId(), creationFileTime = Creation(GetCurrentProcess()),
                        observedFileTime = collectionEnd, peakBytes = Peak(GetCurrentProcess()), image = selfImage, executableSha256 = selfHash,
                        parentPid = (uint)basic.parentPid.ToUInt64(), command = Environment.GetCommandLineArgs(),
                        collectionStartFileTime = collectionStart, collectionEndFileTime = collectionEnd };
                }
                catch (Exception e) { report.errors.Add("COLLECTOR:" + e.Message); }
                report.elapsedMs = clock.ElapsedMilliseconds;
            }
            return report;
        }
    }
}
