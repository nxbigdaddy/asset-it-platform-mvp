# 在 Windows 开发机（PowerShell）中：打包项目并上传到 Linux 服务器。
# 使用前请安装 OpenSSH 客户端（Windows 可选功能），并配置好 SSH 密钥或密码登录。
#
# 示例：
#   .\scripts\pack-and-upload.ps1 -Server "user@203.0.113.10" -RemoteDir "~/gdzc2026"
#
# 服务器上再执行：
#   cd ~/gdzc2026 && chmod +x scripts/linux-docker-up.sh && ./scripts/linux-docker-up.sh
#   （首次复制 .env.example 为 .env 并设置 JWT_SECRET）

param(
    [Parameter(Mandatory = $true)]
    [string] $Server,
    [string] $RemoteDir = "~/gdzc2026",
    [string] $ArchiveName = "gdzc2026-deploy.tgz"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root "package.json"))) {
    throw "未在项目根目录附近找到 package.json（脚本应位于 scripts 下）"
}

$tarPath = Join-Path $env:TEMP $ArchiveName
if (Test-Path $tarPath) { Remove-Item $tarPath -Force }

Write-Host "打包项目: $root -> $tarPath"
Push-Location $root
try {
    # Windows 自带 tar：排除 node_modules、构建产物与本地数据库
    tar -czf $tarPath `
        --exclude=node_modules `
        --exclude=web/node_modules `
        --exclude=dist `
        --exclude=web/dist `
        --exclude=.git `
        --exclude=uploads `
        --exclude=*.db `
        --exclude=*.db-journal `
        .
} finally {
    Pop-Location
}

$remoteArchive = "/tmp/$ArchiveName"
Write-Host "上传: $tarPath -> ${Server}:$remoteArchive"
scp $tarPath "${Server}:$remoteArchive"

$remoteCmd = "mkdir -p $RemoteDir && cd $RemoteDir && tar -xzf $remoteArchive && rm -f $remoteArchive && chmod +x scripts/linux-docker-up.sh 2>/dev/null; pwd"
Write-Host "在服务器上解压到 $RemoteDir ..."
ssh $Server $remoteCmd

Write-Host ""
Write-Host "完成。请 SSH 登录服务器后："
Write-Host "  cd $RemoteDir"
Write-Host "  （首次）cp .env.example .env 并设置 JWT_SECRET"
Write-Host "  ./scripts/linux-docker-up.sh"
