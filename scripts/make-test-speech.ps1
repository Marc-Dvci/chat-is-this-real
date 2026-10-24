param([Parameter(Mandatory=$true)][string]$OutlinePath, [Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $englishVoice = $speech.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'en-US' } | Select-Object -First 1
  if (-not $englishVoice) { throw 'An English system voice is required for the prerecorded test.' }
  $speech.SelectVoice($englishVoice.VoiceInfo.Name)
  $speech.Rate = 0
  $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $outline = Get-Content -LiteralPath $OutlinePath -Raw | ConvertFrom-Json
  foreach ($paragraph in $outline) {
    $target = Join-Path $OutputDirectory ('speech-' + $paragraph.id + '.wav')
    $speech.SetOutputToWaveFile($target, $format)
    $speech.Speak([string]$paragraph.text)
    $speech.SetOutputToNull()
  }
} finally { $speech.Dispose() }
