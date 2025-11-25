# Simple deployment script for Supabase edge functions
# This creates a deployment package that you can manually upload

$functionName = "send-campaign-batch"
$projectId = "lyerkyijpavilyufcrgb"
$functionPath = ".\supabase\functions\$functionName\index.ts"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Supabase Function Deployment Helper" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project ID: $projectId" -ForegroundColor Yellow
Write-Host "Function: $functionName" -ForegroundColor Yellow
Write-Host ""

# Check if file exists
if (Test-Path $functionPath) {
    Write-Host "✓ Function file found" -ForegroundColor Green
    Write-Host ""
    Write-Host "To deploy this function, follow these steps:" -ForegroundColor White
    Write-Host ""
    Write-Host "1. Go to: https://supabase.com/dashboard/project/$projectId/functions" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Click on '$functionName' function" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Click 'Edit function' or look for the code editor" -ForegroundColor White
    Write-Host ""
    Write-Host "4. Replace all the code with the content from:" -ForegroundColor White
    Write-Host "   $functionPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "5. Click 'Deploy' or 'Save'" -ForegroundColor White
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Offer to open the dashboard
    $openBrowser = Read-Host "Would you like to open the Supabase dashboard now? (y/n)"
    if ($openBrowser -eq 'y' -or $openBrowser -eq 'Y') {
        Start-Process "https://supabase.com/dashboard/project/$projectId/functions"
        Write-Host "✓ Dashboard opened in browser" -ForegroundColor Green
    }
    
    # Offer to open the file
    Write-Host ""
    $openFile = Read-Host "Would you like to open the function file in your editor? (y/n)"
    if ($openFile -eq 'y' -or $openFile -eq 'Y') {
        code $functionPath
        Write-Host "✓ File opened in VS Code" -ForegroundColor Green
    }
    
} else {
    Write-Host "✗ Function file not found at: $functionPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
