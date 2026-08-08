/**
 * js/mission_control/tabs/mc_import_tab.js
 * Anansi Forge Mission Control - Import Tab
 */

(() => {
    function renderImportTab() {
        return `<div class="mc-import-panel">
      <h3 class="mc-section-title">📥 Import Tracker Data</h3>
      <p class="mc-import-desc">Import tracking metadata from your Excel spreadsheets. Export your Excel file to JSON first using the PowerShell script below, then upload it here.</p>

      <div class="mc-import-instructions">
        <h4>Step 1: Export your Excel to JSON</h4>
        <p>Run this script in PowerShell, pointed at your Excel file:</p>
        <pre class="mc-code-block">$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$wb = $excel.Workbooks.Open("C:\\path\\to\\Anansi_Forge_Master_Production_Tracker_V2.xlsx")

$result = @{ characters = @(); scenarios = @(); stories = @() }

$ws = $wb.Sheets["Characters"]
for ($r = 2; $r -le $ws.UsedRange.Rows.Count; $r++) {
  $name = $ws.Cells.Item($r,1).Text
  if ($name -eq "") { continue }
  $result.characters += @{
    name=$name; universe=$ws.Cells.Item($r,2).Text
    project=$ws.Cells.Item($r,3).Text; priority=$ws.Cells.Item($r,5).Text
    status=$ws.Cells.Item($r,6).Text
    generated=($ws.Cells.Item($r,7).Text -ne "")
    goldenTemplate=($ws.Cells.Item($r,8).Text -ne "")
    test1=($ws.Cells.Item($r,9).Text -ne "")
    trimmed=($ws.Cells.Item($r,10).Text -ne "")
    test2=($ws.Cells.Item($r,11).Text -ne "")
    complete=($ws.Cells.Item($r,12).Text -ne "")
    published=($ws.Cells.Item($r,13).Text -ne "")
  }
}

$wb.Close($false)
$excel.Quit()
$result | ConvertTo-Json -Depth 5 | Out-File "tracker-import.json" -Encoding utf8
Write-Host "Done! tracker-import.json created."</pre>
      </div>

      <div class="mc-import-upload">
        <h4>Step 2: Upload JSON</h4>
        <div class="mc-import-dropzone" id="mc-import-dropzone">
          <div class="mc-import-drop-content">
            <span class="mc-import-icon">📂</span>
            <p>Drop your <code>tracker-import.json</code> here, or click to browse</p>
            <button class="mc-btn mc-btn-primary" id="mc-import-browse">Browse File</button>
          </div>
        </div>
        <input type="file" id="mc-import-file-input" accept=".json" hidden>
        <div id="mc-import-preview" class="mc-import-preview" style="display:none;"></div>
        <button class="mc-btn mc-btn-primary" id="mc-import-confirm" style="display:none; margin-top:12px;">✓ Import Records</button>
      </div>
    </div>`;
    }

    window.MissionControlTabs = window.MissionControlTabs || {};
    window.MissionControlTabs.renderImportTab = renderImportTab;
})();
