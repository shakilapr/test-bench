# Sends firmware/secrets.json over serial as a PROVISION command.
# Usage: .\scripts\provision.ps1 -Port COM5
param(
  [Parameter(Mandatory=$true)][string]$Port,
  [int]$Baud = 115200,
  [string]$SecretsPath = (Join-Path $PSScriptRoot "..\secrets.json")
)

$json = (Get-Content -Raw -Path $SecretsPath).Trim()
$line = "PROVISION $json`n"

$sp = New-Object System.IO.Ports.SerialPort $Port, $Baud, 'None', 8, 'One'
$sp.NewLine = "`n"
$sp.WriteTimeout = 2000
$sp.ReadTimeout  = 200
$sp.Open()
# ESP32-S3 native USB-Serial-JTAG needs both DTR and RTS asserted high so
# data is considered "live" on the CDC endpoint. Asserting only one of them
# pulses the reset/boot pin; asserting both holds the chip in normal run.
$sp.DtrEnable = $true
$sp.RtsEnable = $true
try {
  Start-Sleep -Milliseconds 500
  $sp.DiscardInBuffer()
  $sp.Write($line)
  $sp.BaseStream.Flush()
  Write-Host "Sent provisioning line to $Port. Listening 6s for ack..."
  $buf = New-Object byte[] 4096
  $end = (Get-Date).AddSeconds(6)
  while ((Get-Date) -lt $end) {
    if ($sp.BytesToRead -gt 0) {
      $n = $sp.Read($buf,0,[Math]::Min($buf.Length,$sp.BytesToRead))
      [System.Text.Encoding]::ASCII.GetString($buf,0,$n) | Write-Host -NoNewline
    } else { Start-Sleep -Milliseconds 50 }
  }
  Write-Host ""
} finally {
  $sp.Close()
}
