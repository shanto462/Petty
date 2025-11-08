# Petty Chrome Extension Build Script
# Minifies JS/CSS files using terser and csso, then creates a production-ready zip package

param(
    [string]$OutputDir = ".\build",
    [string]$ZipName = "petty-extension.zip"
)

Write-Host "[BUILD] Building Petty Chrome Extension..." -ForegroundColor Cyan

# Check if Node.js is installed
$nodeVersion = $null
try {
    $nodeVersion = node --version 2>$null
} catch {
    Write-Host "[ERROR] Node.js is not installed!" -ForegroundColor Red
    Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Node.js version: $nodeVersion" -ForegroundColor Green

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "[NPM] Installing dependencies..." -ForegroundColor Yellow
    npm install --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install dependencies!" -ForegroundColor Red
        exit 1
    }
}

# Cleanup previous build
if (Test-Path $OutputDir) {
    Write-Host "[CLEAN] Removing previous build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $OutputDir
}

# Create build directory
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Files to exclude from the build
$excludePatterns = @(
    "*.ps1",           # PowerShell scripts
    "*.sh",            # Shell scripts
    "*.py",            # Python scripts
    "*.md",            # Markdown files
    "*.git*",          # Git files
    ".gitignore",      # Git ignore
    ".vscode",         # VS Code settings
    ".idea",           # JetBrains IDE settings
    "node_modules",    # Node modules
    "build",           # Build directory itself
    "*.log",           # Log files
    "*.tmp",           # Temp files
    ".DS_Store",       # macOS files
    "Thumbs.db",       # Windows thumbnails
    "package.json",    # Package config
    "package-lock.json" # NPM lock file
)

# Function to minify and obfuscate JavaScript
function Minify-JavaScript {
    param(
        [string]$inputPath,
        [string]$outputPath
    )
    
    $obfuscatorPath = ".\node_modules\.bin\javascript-obfuscator.cmd"
    if (-not (Test-Path $obfuscatorPath)) {
        $obfuscatorPath = ".\node_modules\.bin\javascript-obfuscator"
    }
    
    # JavaScript Obfuscator options:
    # --compact: Compact code (no newlines)
    # --control-flow-flattening: Make code flow harder to understand
    # --control-flow-flattening-threshold 0.5: Apply to 50% of nodes
    # --dead-code-injection: Inject dead code
    # --dead-code-injection-threshold 0.2: 20% dead code
    # --debug-protection: Disable debugger
    # --disable-console-output: Disable console output
    # --identifier-names-generator: Use hexadecimal names
    # --rename-globals: Rename global variables
    # --self-defending: Protect from formatting/tampering
    # --string-array: Move strings to array
    # --string-array-encoding: Encode strings (base64/rc4)
    # --string-array-threshold 0.75: 75% of strings to array
    # --transform-object-keys: Transform object keys
    # --unicode-escape-sequence: Encode strings as unicode
    
    & $obfuscatorPath $inputPath `
        --output $outputPath `
        --compact true `
        --control-flow-flattening true `
        --control-flow-flattening-threshold 0.5 `
        --dead-code-injection true `
        --dead-code-injection-threshold 0.2 `
        --debug-protection false `
        --disable-console-output false `
        --identifier-names-generator hexadecimal `
        --rename-globals false `
        --self-defending false `
        --string-array true `
        --string-array-encoding base64 `
        --string-array-threshold 0.75 `
        --transform-object-keys true `
        --unicode-escape-sequence false 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    [WARN] Obfuscation failed, trying terser..." -ForegroundColor Yellow
        
        # Fallback to terser
        $terserPath = ".\node_modules\.bin\terser.cmd"
        if (-not (Test-Path $terserPath)) {
            $terserPath = ".\node_modules\.bin\terser"
        }
        
        & $terserPath $inputPath --compress --mangle --comments false --output $outputPath 2>$null
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    [WARN] Terser also failed, copying original file" -ForegroundColor Yellow
            Copy-Item -Path $inputPath -Destination $outputPath -Force
        }
    }
}

# Function to minify CSS using csso
function Minify-CSS {
    param(
        [string]$inputPath,
        [string]$outputPath
    )
    
    $cssoPath = ".\node_modules\.bin\csso.cmd"
    if (-not (Test-Path $cssoPath)) {
        $cssoPath = ".\node_modules\.bin\csso"
    }
    
    # CSSO options:
    # --input: Input file
    # --output: Output file
    & $cssoPath --input $inputPath --output $outputPath 2>$null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    [WARN] CSSO failed, copying original file" -ForegroundColor Yellow
        Copy-Item -Path $inputPath -Destination $outputPath -Force
    }
}

# Function to check if file should be excluded
function Should-Exclude {
    param([string]$path)
    
    foreach ($pattern in $excludePatterns) {
        if ($path -like "*$pattern*") {
            return $true
        }
    }
    return $false
}

# Copy and minify files
Write-Host "[BUILD] Copying and minifying files..." -ForegroundColor Cyan

# Get all files recursively
Get-ChildItem -Path . -Recurse -File | ForEach-Object {
    $file = $_
    $relativePath = $file.FullName.Substring((Get-Location).Path.Length + 1)
    
    # Skip excluded files
    if (Should-Exclude $relativePath) {
        Write-Host "  [SKIP] $relativePath" -ForegroundColor DarkGray
        return
    }
    
    $destPath = Join-Path $OutputDir $relativePath
    $destDir = Split-Path -Parent $destPath
    
    # Create destination directory if it doesn't exist
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    }
    
    # Process based on file type
    switch ($file.Extension) {
        ".js" {
            Write-Host "  [OBFUSCATE] $relativePath" -ForegroundColor Green
            Minify-JavaScript -inputPath $file.FullName -outputPath $destPath
        }
        ".css" {
            Write-Host "  [MINIFY-CSS] $relativePath" -ForegroundColor Green
            Minify-CSS -inputPath $file.FullName -outputPath $destPath
        }
        default {
            Write-Host "  [COPY] $relativePath" -ForegroundColor White
            Copy-Item -Path $file.FullName -Destination $destPath -Force
        }
    }
}

# Create ZIP file
$zipPath = Join-Path (Get-Location) $ZipName
if (Test-Path $zipPath) {
    Remove-Item -Force $zipPath
}

Write-Host "`n[ZIP] Creating package: $ZipName" -ForegroundColor Cyan
Compress-Archive -Path "$OutputDir\*" -DestinationPath $zipPath -CompressionLevel Optimal

# Get file sizes
$buildSize = (Get-ChildItem -Path $OutputDir -Recurse | Measure-Object -Property Length -Sum).Sum
$zipSize = (Get-Item $zipPath).Length

Write-Host "`n[SUCCESS] Build complete!" -ForegroundColor Green
Write-Host "  Build directory: $OutputDir" -ForegroundColor White
Write-Host "  ZIP file: $zipPath" -ForegroundColor White
Write-Host "  Build size: $([math]::Round($buildSize/1MB, 2)) MB" -ForegroundColor White
Write-Host "  ZIP size: $([math]::Round($zipSize/1MB, 2)) MB" -ForegroundColor White
Write-Host "`n[READY] Upload to Chrome Web Store!" -ForegroundColor Cyan

# Show file count
$fileCount = (Get-ChildItem -Path $OutputDir -Recurse -File).Count
Write-Host "  Total files: $fileCount" -ForegroundColor White

