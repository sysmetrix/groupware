using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

public sealed class ServiceState {
    public string service { get; set; }
    public string status { get; set; }
    public int port { get; set; }
    public bool owned { get; set; }
}

public sealed class ServiceClient {
    readonly string root;
    public ServiceClient(string directory) { root = directory; }
    public async Task<string> Run(string action, string service) {
        if (!new[] { "Status", "Start", "Stop" }.Contains(action) || !new[] { "All", "App", "Ollama" }.Contains(service)) throw new ArgumentException("Invalid service action");
        var script = Path.Combine(root, "scripts", "windows-services.ps1");
        string directory = Path.Combine(root, "data", "control-panel"); Directory.CreateDirectory(directory);
        string outputFile = Path.Combine(directory, "command-" + Guid.NewGuid().ToString("N") + ".txt");
        string command = "$ErrorActionPreference='Stop'; try { & '" + script.Replace("'", "''") + "' -Action " + action + " -Service " + service + " 2>&1 | Out-File -Encoding utf8 -LiteralPath '" + outputFile.Replace("'", "''") + "'; exit 0 } catch { $_ | Out-File -Encoding utf8 -LiteralPath '" + outputFile.Replace("'", "''") + "'; exit 1 }";
        var start = new ProcessStartInfo {
            FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
            Arguments = "-NoProfile -NonInteractive -EncodedCommand " + Convert.ToBase64String(Encoding.Unicode.GetBytes(command)),
            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true
        };
        try {
        using (var process = Process.Start(start)) {
            bool finished = await Task.Run(() => process.WaitForExit(120000));
            if (!finished) {
                // The service supervisor remains authoritative; never kill its tree by a port/name.
                try { process.Kill(); } catch { }
                throw new Exception("처리 시간을 초과했습니다. 서비스가 계속 실행 중일 수 있습니다. 상태를 다시 확인하세요.");
            }
            string text = File.Exists(outputFile) ? File.ReadAllText(outputFile, Encoding.UTF8) : "명령 출력이 없습니다.";
            if (process.ExitCode != 0) throw new Exception(text);
            return text;
        }
        } finally { try { File.Delete(outputFile); } catch { } }
    }
    public async Task<ServiceState[]> Status() {
        return new JavaScriptSerializer().Deserialize<ServiceState[]>(await Run("Status", "All"));
    }
}

public sealed class ControlWindow : Form {
    readonly ServiceClient client;
    readonly Label modelState = new Label(), appState = new Label(), notice = new Label();
    readonly TextBox log = new TextBox();
    readonly Button modelStart, modelStop, appStart, appStop, allStart, allStop, open, refresh, closeAll;
    readonly Timer timer = new Timer();
    ServiceState[] states = new ServiceState[0];
    bool busy, allowClose;
    public ControlWindow(string root) {
        client = new ServiceClient(root);
        Text = "로컬 AI · 업무 도우미 실행 관리자";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        ClientSize = new Size(780, 620); MinimumSize = new Size(720, 640);
        Font = new Font("맑은 고딕", 10F); BackColor = Color.FromArgb(244, 247, 245);
        StartPosition = FormStartPosition.CenterScreen; AutoScaleMode = AutoScaleMode.Dpi;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(26), ColumnCount = 1, RowCount = 8 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (int height in new[] { 68, 100, 100, 52, 48 }) layout.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        Controls.Add(layout);
        var heading = new Label { Text = "내 PC의 AI와 업무 도우미", Font = new Font(Font.FontFamily, 19F, FontStyle.Bold), Dock = DockStyle.Fill, ForeColor = Color.FromArgb(31, 71, 53) };
        layout.Controls.Add(heading, 0, 0);
        modelStart = Button("시작", true); modelStop = Button("종료", false);
        appStart = Button("시작", true); appStop = Button("종료", false);
        layout.Controls.Add(Card("로컬 LLM", "Ollama · 서버를 시작하면 업무 도우미에서 AI 요약 사용", modelState, modelStart, modelStop), 0, 1);
        layout.Controls.Add(Card("업무 도우미", "내 문서 검색 · 초안 점검 · 업무 브리핑", appState, appStart, appStop), 0, 2);
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(0, 8, 0, 0) };
        allStart = Button("모두 시작", true); allStop = Button("모두 종료", false);
        open = Button("업무 도우미 열기", false, 155); refresh = Button("상태 새로고침", false, 135);
        actions.Controls.AddRange(new Control[] { allStart, allStop, open, refresh }); layout.Controls.Add(actions, 0, 3);
        notice.Dock = DockStyle.Fill; notice.Text = "실행 상태를 확인하고 있습니다…"; notice.ForeColor = Color.FromArgb(65, 90, 75); notice.Padding = new Padding(0, 8, 0, 0);
        layout.Controls.Add(notice, 0, 4);
        log.Multiline = true; log.ReadOnly = true; log.ScrollBars = ScrollBars.Vertical; log.Dock = DockStyle.Fill; log.BackColor = Color.White; log.BorderStyle = BorderStyle.FixedSingle;
        layout.Controls.Add(log, 0, 5);
        layout.Controls.Add(new Label { Dock = DockStyle.Fill, Text = "서버 종료 전 진행 중인 문서 처리 완료를 확인하세요. 모델 파일과 문서는 삭제되지 않습니다.", Font = new Font(Font.FontFamily, 9F), Padding = new Padding(0, 10, 0, 0) }, 0, 6);
        var footer = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false };
        closeAll = Button("모두 종료 후 닫기", false, 165);
        var closeWindow = Button("창만 닫기", false, 125);
        footer.Controls.Add(closeAll); footer.Controls.Add(closeWindow); layout.Controls.Add(footer, 0, 7);
        modelStart.Click += async (s, e) => await Operate("Start", "Ollama", false);
        modelStop.Click += async (s, e) => await Operate("Stop", "Ollama", false);
        appStart.Click += async (s, e) => await Operate("Start", "App", false);
        appStop.Click += async (s, e) => await Operate("Stop", "App", false);
        allStart.Click += async (s, e) => await Operate("Start", "All", false);
        allStop.Click += async (s, e) => await Operate("Stop", "All", false);
        closeAll.Click += async (s, e) => await Operate("Stop", "All", true);
        refresh.Click += async (s, e) => await RefreshState();
        open.Click += (s, e) => { var state = states.FirstOrDefault(x => x.service == "App"); if (state != null && state.status == "running-owned") Process.Start(new ProcessStartInfo("http://127.0.0.1:" + state.port) { UseShellExecute = true }); };
        closeWindow.Click += (s, e) => { if (!busy) { allowClose = true; Close(); } };
        Shown += async (s, e) => await RefreshState();
        timer.Interval = 15000; timer.Tick += async (s, e) => { if (!busy) await RefreshState(); }; timer.Start();
        FormClosing += async (s, e) => {
            if (allowClose) return;
            e.Cancel = true;
            if (busy) { notice.Text = "처리가 끝난 뒤 창을 닫아 주세요."; return; }
            var answer = MessageBox.Show(this, "로컬 LLM과 업무 도우미도 종료할까요?\n\n예: 모두 종료 후 닫기\n아니요: 서버는 유지하고 이 창만 닫기", "종료 방식", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
            if (answer == DialogResult.Yes) await Operate("Stop", "All", true);
            else if (answer == DialogResult.No) { allowClose = true; BeginInvoke(new Action(Close)); }
        };
        FormClosed += (s, e) => timer.Dispose();
        SetBusy(true); SetBusy(false);
    }
    Button Button(string text, bool primary, int width = 110) {
        return new Button { Text = text, Width = width, Height = 36, FlatStyle = FlatStyle.Flat, Margin = new Padding(0, 0, 9, 0),
            BackColor = primary ? Color.FromArgb(36, 101, 73) : Color.White, ForeColor = primary ? Color.White : Color.FromArgb(38, 66, 49), Cursor = Cursors.Hand };
    }
    Control Card(string title, string description, Label status, Button start, Button stop) {
        var card = new TableLayoutPanel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(14, 10, 10, 10), Margin = new Padding(0, 0, 0, 10), ColumnCount = 2, RowCount = 3 };
        card.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); card.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 245));
        card.RowStyles.Add(new RowStyle(SizeType.Absolute, 26)); card.RowStyles.Add(new RowStyle(SizeType.Absolute, 24)); card.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        card.Controls.Add(new Label { Text = title, Dock = DockStyle.Fill, Font = new Font(Font.FontFamily, 12F, FontStyle.Bold) }, 0, 0);
        var descriptionLabel = new Label { Text = description, Dock = DockStyle.Fill, Font = new Font(Font.FontFamily, 8.5F), ForeColor = Color.DimGray };
        card.Controls.Add(descriptionLabel, 0, 1);
        status.Dock = DockStyle.Fill; status.Text = "확인 중"; status.ForeColor = Color.FromArgb(36, 101, 73); card.Controls.Add(status, 0, 2); card.SetColumnSpan(status, 2);
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false }; buttons.Controls.Add(start); buttons.Controls.Add(stop); card.Controls.Add(buttons, 1, 0); card.SetRowSpan(buttons, 2);
        return card;
    }
    void Append(string text) { log.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + text.Trim() + Environment.NewLine); }
    void SetBusy(bool value) {
        busy = value;
        foreach (var button in new[] { modelStart, modelStop, appStart, appStop, allStart, allStop, open, refresh, closeAll }) button.Enabled = !value;
        if (!value) {
            modelStop.Enabled = states.Any(x => x.service == "Ollama" && x.owned);
            appStop.Enabled = states.Any(x => x.service == "App" && x.owned);
            modelStart.Enabled = states.Any(x => x.service == "Ollama" && (x.status == "stopped" || x.status == "stale-or-stopped"));
            appStart.Enabled = states.Any(x => x.service == "App" && (x.status == "stopped" || x.status == "stale-or-stopped"));
            open.Enabled = states.Any(x => x.service == "App" && x.status == "running-owned");
        }
        UseWaitCursor = value;
    }
    string StateText(ServiceState state) {
        if (state == null) return "상태 확인 불가";
        string label = state.status == "running-owned" ? "실행 중 · 이 프로그램에서 종료 가능" :
            state.status == "unmanaged-listener" ? "별도로 실행됨 · 원래 실행 창에서 종료 필요" :
            state.status == "starting-or-exited-owned" ? "시작 중 또는 종료 확인 필요" : "종료됨";
        return label + "  |  포트 " + state.port;
    }
    async Task ReadState() {
        states = await client.Status();
        modelState.Text = StateText(states.FirstOrDefault(x => x.service == "Ollama"));
        appState.Text = StateText(states.FirstOrDefault(x => x.service == "App"));
    }
    public async Task RefreshState() {
        if (busy) return; SetBusy(true);
        try { await ReadState(); notice.Text = "상태 확인 완료 · 창만 닫으면 실행 중인 서버는 유지됩니다."; }
        catch (Exception error) { states = new ServiceState[0]; modelState.Text = appState.Text = "상태 확인 실패"; notice.Text = "실행 상태를 확인하지 못했습니다. 아래 내용을 확인하세요."; Append(error.Message); }
        finally { SetBusy(false); }
    }
    async Task Operate(string action, string service, bool close) {
        if (busy) return; SetBusy(true);
        notice.Text = action == "Start" ? "시작 중입니다. 잠시 기다려 주세요…" : "종료 중입니다. 잠시 기다려 주세요…";
        bool succeeded = true;
        try {
            await ReadState();
            var names = service == "All" ? (action == "Start" ? new[] { "Ollama", "App" } : new[] { "App", "Ollama" }) : new[] { service };
            foreach (var name in names) {
                var state = states.FirstOrDefault(x => x.service == name);
                if (state == null) throw new Exception("서비스 상태가 없습니다. 다시 확인하세요.");
                if (action == "Start" && state.status == "running-owned") { Append(name + ": 이미 실행 중입니다."); continue; }
                if (state.status == "unmanaged-listener") { succeeded = false; Append(name + ": 별도 실행된 서버는 변경하지 않았습니다. 원래 실행 창에서 종료한 후 다시 시작하세요."); continue; }
                try { await client.Run(action, name); Append(name + (action == "Start" ? ": 시작 완료" : ": 종료 완료")); }
                catch (Exception error) { succeeded = false; Append(name + ": " + error.Message); }
            }
            await ReadState();
            if (action == "Stop" && states.Where(x => service == "All" || x.service == service).Any(x => x.status == "running-owned" || x.status == "unmanaged-listener" || x.status == "starting-or-exited-owned")) succeeded = false;
            notice.Text = succeeded ? "완료했습니다." : "일부 작업을 완료하지 못했습니다. 실행 상태와 기록을 확인하세요.";
        } catch (Exception error) { succeeded = false; Append(error.Message); notice.Text = "실행 상태를 다시 확인하세요."; }
        finally { SetBusy(false); }
        if (close && succeeded) { allowClose = true; Close(); }
    }
    public async Task Smoke(string output) {
        var deadline = DateTime.UtcNow.AddSeconds(40);
        while (busy) { if (DateTime.UtcNow > deadline) throw new Exception("Initial refresh timed out"); await Task.Delay(100); }
        await RefreshState();
        if (states.Length != 2) throw new Exception("Expected both service states");
        using (var bitmap = new Bitmap(Width, Height)) { DrawToBitmap(bitmap, new Rectangle(Point.Empty, Size)); bitmap.Save(output); }
        allowClose = true; Close();
    }
    public async Task SmokeLifecycle(string output) {
        try {
            foreach (var name in new[] { "App", "Ollama" }) {
                await client.Run("Stop", name);
                if ((await client.Status()).First(x => x.service == name).status == "running-owned") throw new Exception("Stop failed: " + name);
                await client.Run("Start", name);
                if ((await client.Status()).First(x => x.service == name).status != "running-owned") throw new Exception("Start failed: " + name);
            }
            File.WriteAllText(output, "PASS: app and Ollama stop/start, final state both running-owned");
        } catch (Exception error) { File.WriteAllText(output + ".error", error.ToString()); Environment.Exit(1); }
        finally { allowClose = true; Close(); }
    }
}

public static class Program {
    [STAThread] public static int Main(string[] args) {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        try {
            string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", ".."));
            if (args.Length >= 2 && args[0] == "--root") root = Path.GetFullPath(args[1]);
            if (!File.Exists(Path.Combine(root, "scripts", "windows-services.ps1"))) throw new Exception("프로젝트 폴더를 찾을 수 없습니다. 설치 스크립트를 다시 실행하세요.");
            var window = new ControlWindow(root);
            int smoke = Array.IndexOf(args, "--smoke-test");
            if (smoke >= 0 && smoke + 1 < args.Length) {
                window.Shown += async (s, e) => {
                    try { await window.Smoke(args[smoke + 1]); }
                    catch (Exception error) { File.WriteAllText(args[smoke + 1] + ".error", error.ToString()); Environment.Exit(1); }
                };
            }
            int lifecycle = Array.IndexOf(args, "--test-lifecycle");
            if (lifecycle >= 0 && lifecycle + 1 < args.Length) window.Shown += async (s, e) => await window.SmokeLifecycle(args[lifecycle + 1]);
            Application.Run(window); return 0;
        } catch (Exception error) { MessageBox.Show(error.Message, "실행 관리자 오류", MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
    }
}
