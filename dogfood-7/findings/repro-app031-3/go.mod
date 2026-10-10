module repro.local/app031replace

go 1.26

require imported.local/sdk v0.0.0

replace imported.local/sdk => ./libs/shared
