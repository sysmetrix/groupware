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
    public string ConfigurationError { get; private set; }
    public sealed class RuntimePorts {
        public int appPort { get; set; }
        public int ollamaPort { get; set; }
    }
    public ServiceClient(string directory) { root = directory; }
    async Task<RuntimePorts> ReadConfiguration() {
        const string message = "설정 확인 필요 · 앱/모델 포트, 로컬 주소, Node.js 설치를 확인하세요.";
        try {
            var start = new ProcessStartInfo {
                FileName = "node.exe", Arguments = "\"" + Path.Combine(root, "desktop", "runtime-config.mjs") + "\"",
                WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            using (var process = Process.Start(start)) {
                var output = process.StandardOutput.ReadToEndAsync();
                var errors = process.StandardError.ReadToEndAsync();
                if (!await Task.Run(() => process.WaitForExit(10000))) {
                    try { process.Kill(); } catch { }
                    throw new Exception();
                }
                await errors; // Never expose raw environment/parser diagnostics.
                if (process.ExitCode != 0) throw new Exception();
                var ports = new JavaScriptSerializer().Deserialize<RuntimePorts>(await output);
                if (ports == null || ports.appPort < 1 || ports.appPort > 65535 || ports.ollamaPort < 1 || ports.ollamaPort > 65535 || ports.appPort == ports.ollamaPort) throw new Exception();
                ConfigurationError = null;
                return ports;
            }
        } catch { ConfigurationError = message; throw new Exception(message); }
    }
    public async Task<string> Run(string action, string service) {
        if (!new[] { "Status", "Start", "Stop" }.Contains(action) || !new[] { "All", "App", "Ollama" }.Contains(service)) throw new ArgumentException("Invalid service action");
        var ports = new RuntimePorts { appPort = 3210, ollamaPort = 11434 };
        // Stopping uses the script's verified ownership records, even when a
        // subsequently edited configuration is invalid or Node is unavailable.
        if (action != "Stop") {
            try { ports = await ReadConfiguration(); }
            catch { if (action != "Status") throw; }
        }
        if (action == "Start") {
            var current = new JavaScriptSerializer().Deserialize<ServiceState[]>(await RunCommand("Status", "All", ports));
            if (current == null || current.Length != 2 || current.Count(x => x.service == "App") != 1 || current.Count(x => x.service == "Ollama") != 1) throw new Exception("서비스 상태를 확인할 수 없어 시작하지 않았습니다.");
            foreach (var state in current) {
                int configured = state.service == "App" ? ports.appPort : ports.ollamaPort;
                if (state.owned && state.port != configured) throw new Exception("실행 중인 " + state.service + "의 포트가 설정과 다릅니다. 관리 서버를 종료한 뒤 다시 시작하세요.");
            }
        }
        return await RunCommand(action, service, ports);
    }
    async Task<string> RunCommand(string action, string service, RuntimePorts ports) {
        var script = Path.Combine(root, "scripts", "windows-services.ps1");
        string directory = Path.Combine(root, "data", "control-panel"); Directory.CreateDirectory(directory);
        string outputFile = Path.Combine(directory, "command-" + Guid.NewGuid().ToString("N") + ".txt");
        string command = "$ErrorActionPreference='Stop'; try { & '" + script.Replace("'", "''") + "' -Action " + action + " -Service " + service + " -AppPort " + ports.appPort + " -OllamaPort " + ports.ollamaPort + " 2>&1 | Out-File -Encoding utf8 -LiteralPath '" + outputFile.Replace("'", "''") + "'; exit 0 } catch { $_ | Out-File -Encoding utf8 -LiteralPath '" + outputFile.Replace("'", "''") + "'; exit 1 }";
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
    readonly Label summary = new Label(), updated = new Label(), emptyLog = new Label();
    readonly Button modelStart, modelStop, appStart, appStop, allStart, allStop, open, refresh, closeAll;
    readonly Timer timer = new Timer();
    ServiceState[] states = new ServiceState[0];
    bool busy, allowClose;
    public ControlWindow(string root) {
        client = new ServiceClient(root);
        Text = "로컬 AI · 업무 도우미 실행 관리자";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        AutoScaleDimensions = new SizeF(96, 96); AutoScaleMode = AutoScaleMode.Dpi;
        ClientSize = new Size(960, 820); MinimumSize = new Size(900, 820);
        Font = new Font("맑은 고딕", 10F); BackColor = Palette.Canvas; ForeColor = Palette.Ink;
        StartPosition = FormStartPosition.CenterScreen;
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(28, 16, 28, 12), ColumnCount = 1, RowCount = 7 };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        foreach (int height in new[] { 52, 156, 246, 42 }) layout.RowStyles.Add(new RowStyle(SizeType.Absolute, height));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 54));
        Controls.Add(layout);
        var brand = new Panel { Size = new Size(904, 52), Dock = DockStyle.Fill, Margin = Padding.Empty };
        brand.Controls.Add(new PictureBox { Image = Icon.ToBitmap(), SizeMode = PictureBoxSizeMode.Zoom, Location = new Point(0, 3), Size = new Size(32, 32) });
        brand.Controls.Add(LabelAt("groupware", 44, -2, 200, 42, 17, true, Palette.Ink));
        brand.Controls.Add(LabelAt("LOCAL WORKSPACE", 213, 10, 200, 24, 9, false, Palette.Muted));
        var local = LabelAt("내 PC에서 실행", 740, 10, 160, 24, 9, false, Palette.Muted); local.Anchor = AnchorStyles.Top | AnchorStyles.Right; local.TextAlign = ContentAlignment.MiddleRight; brand.Controls.Add(local);
        layout.Controls.Add(brand, 0, 0);

        var hero = new Surface { Size = new Size(904, 140), Dock = DockStyle.Fill, Hero = true, Fill = Color.FromArgb(24, 57, 46), Margin = new Padding(0, 0, 0, 16) };
        hero.Controls.Add(LabelAt("일할 준비, 한곳에서.", 26, 18, 540, 45, 25, true, Color.White, hero.Fill));
        hero.Controls.Add(LabelAt("로컬 AI와 업무 도우미를 가볍게 시작하세요.", 28, 69, 560, 26, 11, false, Color.FromArgb(199, 219, 208), hero.Fill));
        summary.Location = new Point(28, 105); summary.Size = new Size(530, 24); summary.BackColor = hero.Fill; summary.ForeColor = Color.FromArgb(175, 216, 192); summary.Font = new Font(Font.FontFamily, 9F); summary.Text = "서비스 상태 확인 중"; hero.Controls.Add(summary);
        open = Button("업무 도우미 열기  →", true, 198); open.Location = new Point(677, 49); open.Anchor = AnchorStyles.Top | AnchorStyles.Right; open.BackColor = hero.Fill; hero.Controls.Add(open);
        layout.Controls.Add(hero, 0, 1);

        modelStart = Button("시작", true, 112); modelStop = Button("종료", false, 112);
        appStart = Button("시작", true, 112); appStop = Button("종료", false, 112);
        var cards = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, RowCount = 1, Margin = Padding.Empty };
        cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50)); cards.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50)); cards.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var modelCard = Card("로컬 AI", "Ollama · 문서 요약과 근거 정리", "첫 AI 요청 시 모델을 메모리에 불러옵니다.", modelState, modelStart, modelStop, true); modelCard.Margin = new Padding(0, 0, 8, 8);
        var appCard = Card("업무 도우미", "내 문서 검색 · 초안 점검 · 업무 브리핑", "실행 후 위의 열기 버튼으로 접속하세요.", appState, appStart, appStop, false); appCard.Margin = new Padding(8, 0, 0, 8);
        cards.Controls.Add(modelCard, 0, 0); cards.Controls.Add(appCard, 1, 0); layout.Controls.Add(cards, 0, 2);

        var statusRow = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Margin = Padding.Empty };
        statusRow.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100)); statusRow.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 180));
        notice.Dock = DockStyle.Fill; notice.Text = "실행 상태를 확인하고 있습니다…"; notice.ForeColor = Palette.Muted; notice.Font = new Font(Font.FontFamily, 9F); notice.TextAlign = ContentAlignment.MiddleLeft;
        updated.Dock = DockStyle.Fill; updated.ForeColor = Palette.Muted; updated.Font = new Font(Font.FontFamily, 9F); updated.TextAlign = ContentAlignment.MiddleRight;
        statusRow.Controls.Add(notice, 0, 0); statusRow.Controls.Add(updated, 1, 0); layout.Controls.Add(statusRow, 0, 3);

        var activity = new Surface { Dock = DockStyle.Fill, Margin = new Padding(0, 0, 0, 4), Padding = new Padding(20, 14, 20, 14) };
        var activityGrid = new TableLayoutPanel { Dock = DockStyle.Fill, BackColor = Color.White, RowCount = 2, ColumnCount = 1, Margin = Padding.Empty };
        activityGrid.RowStyles.Add(new RowStyle(SizeType.Absolute, 32)); activityGrid.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        activityGrid.Controls.Add(new Label { Text = "실행 기록", Dock = DockStyle.Fill, Font = new Font(Font.FontFamily, 10F, FontStyle.Bold), ForeColor = Palette.Ink }, 0, 0);
        var logArea = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Margin = Padding.Empty };
        log.Multiline = true; log.ReadOnly = true; log.ScrollBars = ScrollBars.Vertical; log.Dock = DockStyle.Fill; log.BackColor = Color.White; log.ForeColor = Palette.Muted; log.Font = new Font(Font.FontFamily, 9F); log.BorderStyle = BorderStyle.None;
        emptyLog.Text = "아직 실행 기록이 없습니다.\n서비스를 시작하거나 종료하면 여기에 표시됩니다."; emptyLog.Dock = DockStyle.Fill; emptyLog.ForeColor = Palette.Muted; emptyLog.TextAlign = ContentAlignment.MiddleCenter; emptyLog.Font = new Font(Font.FontFamily, 9F);
        logArea.Controls.Add(log); logArea.Controls.Add(emptyLog); activityGrid.Controls.Add(logArea, 0, 1); activity.Controls.Add(activityGrid); layout.Controls.Add(activity, 0, 4);
        layout.Controls.Add(new Label { Text = "창만 닫으면 서비스는 계속 실행됩니다. 종료해도 모델과 문서는 보관됩니다.", Dock = DockStyle.Fill, ForeColor = Palette.Muted, Font = new Font(Font.FontFamily, 9F), TextAlign = ContentAlignment.MiddleLeft }, 0, 5);
        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 2, Margin = Padding.Empty };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 55)); footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 45));
        var actions = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false, Padding = new Padding(0, 7, 0, 0), Margin = Padding.Empty };
        allStart = Button("모두 시작", true, 112); allStop = Button("모두 종료", false, 112); refresh = Button("새로고침", false, 108);
        actions.Controls.AddRange(new Control[] { allStart, allStop, refresh }); footer.Controls.Add(actions, 0, 0);
        var exitActions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft, WrapContents = false, Padding = new Padding(0, 7, 0, 0), Margin = Padding.Empty };
        closeAll = Button("모두 종료 후 닫기", false, 166); var closeWindow = Button("창만 닫기", false, 112);
        exitActions.Controls.Add(closeAll); exitActions.Controls.Add(closeWindow); footer.Controls.Add(exitActions, 1, 0); layout.Controls.Add(footer, 0, 6);
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
    Label LabelAt(string text, int x, int y, int width, int height, float size, bool bold, Color color, Color? background = null) {
        return new Label { Text = text, Location = new Point(x, y), Size = new Size(width, height), Font = new Font(Font.FontFamily, size, bold ? FontStyle.Bold : FontStyle.Regular), ForeColor = color, BackColor = background ?? Color.Transparent };
    }
    Button Button(string text, bool primary, int width = 110) {
        return new ActionButton { Text = text, Primary = primary, Width = width, Height = 40, Font = new Font(Font.FontFamily, 9.5F, FontStyle.Bold), Margin = new Padding(0, 0, 8, 0), BackColor = Palette.Canvas, AccessibleName = text };
    }
    Control Card(string title, string description, string hint, Label status, Button start, Button stop, bool model) {
        var card = new Surface { Size = new Size(444, 238), Dock = DockStyle.Fill };
        card.Controls.Add(new ServiceGlyph(model) { Location = new Point(22, 20) });
        card.Controls.Add(LabelAt(title, 80, 15, 300, 38, 16, true, Palette.Ink, Color.White));
        var descriptionLabel = LabelAt(description, 80, 51, 342, 25, 9, false, Palette.Muted, Color.White);
        descriptionLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right; card.Controls.Add(descriptionLabel);
        status.Location = new Point(22, 92); status.Size = new Size(390, 32); status.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right; status.TextAlign = ContentAlignment.MiddleLeft; status.Text = "상태 확인 중"; status.BackColor = Color.FromArgb(238, 245, 240); status.Padding = new Padding(10, 0, 0, 0); status.ForeColor = Palette.Green; status.Font = new Font(Font.FontFamily, 9F, FontStyle.Bold); card.Controls.Add(status);
        var hintLabel = LabelAt(hint, 22, 137, 400, 24, 9, false, Palette.Muted, Color.White);
        hintLabel.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right; card.Controls.Add(hintLabel);
        start.Location = new Point(22, 178); stop.Location = new Point(142, 178); start.BackColor = stop.BackColor = Color.White; card.Controls.Add(start); card.Controls.Add(stop);
        return card;
    }
    void Append(string text) { emptyLog.Visible = false; log.AppendText(DateTime.Now.ToString("HH:mm:ss") + "  " + text.Trim() + Environment.NewLine); }
    void SetBusy(bool value) {
        busy = value;
        foreach (var button in new[] { modelStart, modelStop, appStart, appStop, allStart, allStop, open, refresh, closeAll }) button.Enabled = !value;
        if (!value) {
            modelStop.Enabled = states.Any(x => x.service == "Ollama" && x.owned);
            appStop.Enabled = states.Any(x => x.service == "App" && x.owned);
            modelStart.Enabled = states.Any(x => x.service == "Ollama" && (x.status == "stopped" || x.status == "stale-or-stopped"));
            appStart.Enabled = states.Any(x => x.service == "App" && (x.status == "stopped" || x.status == "stale-or-stopped"));
            if (client.ConfigurationError != null) modelStart.Enabled = appStart.Enabled = false;
            allStart.Enabled = modelStart.Enabled || appStart.Enabled;
            allStop.Enabled = modelStop.Enabled || appStop.Enabled;
            open.Enabled = states.Any(x => x.service == "App" && x.status == "running-owned");
        }
        UseWaitCursor = value;
    }
    string StateText(ServiceState state) {
        if (state == null) return "상태 확인 불가";
        string label = state.status == "running-owned" ? "●  실행 중" :
            state.status == "unmanaged-listener" ? "별도 실행 · 원래 창에서 종료" :
            state.status == "starting-or-exited-owned" ? "시작 / 종료 확인 필요" : "종료됨";
        return label + "     ·     포트 " + state.port;
    }
    async Task ReadState() {
        states = await client.Status();
        modelState.Text = StateText(states.FirstOrDefault(x => x.service == "Ollama"));
        appState.Text = StateText(states.FirstOrDefault(x => x.service == "App"));
        foreach (var pair in new[] { new { Name = "Ollama", Label = modelState }, new { Name = "App", Label = appState } }) {
            var state = states.FirstOrDefault(x => x.service == pair.Name);
            bool running = state != null && state.status == "running-owned";
            bool warning = state == null || state.status == "unmanaged-listener" || state.status == "starting-or-exited-owned";
            pair.Label.ForeColor = warning ? Color.FromArgb(139, 91, 29) : running ? Palette.Green : Palette.Muted;
            pair.Label.BackColor = warning ? Color.FromArgb(255, 245, 224) : running ? Color.FromArgb(232, 244, 236) : Color.FromArgb(241, 243, 242);
        }
        int count = states.Count(x => x.status == "running-owned");
        summary.Text = states.Any(x => x.status == "unmanaged-listener" || x.status == "starting-or-exited-owned") ? "서비스 상태를 확인해 주세요 · 아래 카드에 안내가 표시됩니다" : count == 2 ? "●  두 서비스 모두 실행 중 · 업무를 시작할 수 있어요" : count == 0 ? "서비스를 시작해 작업 공간을 준비하세요" : "●  서비스 1개 실행 중";
        updated.Text = DateTime.Now.ToString("HH:mm:ss") + " 업데이트";
    }
    public async Task RefreshState() {
        if (busy) return; SetBusy(true);
        try { await ReadState(); notice.Text = client.ConfigurationError ?? "15초마다 실행 상태를 자동으로 확인합니다."; }
        catch (Exception error) { states = new ServiceState[0]; summary.Text = "상태 확인 필요"; modelState.Text = appState.Text = "상태 확인 실패"; modelState.ForeColor = appState.ForeColor = Color.FromArgb(139, 91, 29); modelState.BackColor = appState.BackColor = Color.FromArgb(255, 245, 224); notice.Text = "실행 상태를 확인하지 못했습니다. 아래 내용을 확인하세요."; Append(error.Message); }
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
