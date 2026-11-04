param([string]$InputFile = 'D:/Me/Vibe/Flux/output/flux-export-test.hwpx')
$ErrorActionPreference = 'Stop'
$inputPath = (Resolve-Path -LiteralPath $InputFile).Path
$workspacePath = (Resolve-Path -LiteralPath 'D:/Me/Vibe/Flux').Path
if (-not $inputPath.StartsWith($workspacePath + [IO.Path]::DirectorySeparatorChar)) { throw '검증 파일은 프로젝트 안에 있어야 합니다.' }
$pdfPath = [IO.Path]::ChangeExtension($inputPath, '.pdf')
$fluxHwp = New-Object -ComObject HWPFrame.HwpObject
try {
  $fluxHwp.XHwpWindows.Item(0).Visible = $true
  $opened = $fluxHwp.Open($inputPath, 'HWPX', '')
  if (-not $opened) { throw '한글이 HWPX를 열지 못했습니다.' }
  $fluxHwp.ScanFont()
  $fonts = $fluxHwp.GetFontList(0)
  $saved = $fluxHwp.SaveAs($pdfPath, 'PDF', '')
  if (-not $saved) { throw '한글이 PDF를 저장하지 못했습니다.' }
  [PSCustomObject]@{ Input=$inputPath; PDF=$pdfPath; Fonts=$fonts } | ConvertTo-Json
} finally { if ($fluxHwp) { $fluxHwp.Quit() } }
