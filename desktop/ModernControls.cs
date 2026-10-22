using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

internal static class Palette {
    public static readonly Color Canvas = ColorTranslator.FromHtml("#F3F5F4");
    public static readonly Color Ink = ColorTranslator.FromHtml("#182C26");
    public static readonly Color Muted = ColorTranslator.FromHtml("#677A73");
    public static readonly Color Green = ColorTranslator.FromHtml("#216B55");
    public static readonly Color Line = ColorTranslator.FromHtml("#DFE7E2");
    public static GraphicsPath Round(RectangleF rect, float radius) {
        var path = new GraphicsPath(); float d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure(); return path;
    }
}

internal sealed class Surface : Panel {
    public Color Fill = Color.White;
    public bool Hero;
    public Surface() { DoubleBuffered = true; BackColor = Palette.Canvas; ResizeRedraw = true; }
    protected override void OnPaint(PaintEventArgs e) {
        base.OnPaint(e); var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        float scale = g.DpiX / 96F;
        using (var path = Palette.Round(new RectangleF(1, 1, Width - 3, Height - 3), 16 * scale)) {
            using (var brush = new SolidBrush(Fill)) g.FillPath(brush, path);
            if (!Hero) using (var pen = new Pen(Palette.Line)) g.DrawPath(pen, path);
            if (Hero) {
                var saved = g.Save(); g.SetClip(path);
                g.SetClip(new RectangleF(Width - 300 * scale, 0, 300 * scale, Height), CombineMode.Intersect);
                using (var pen = new Pen(Color.FromArgb(28, 203, 240, 215), 1.4F * scale)) {
                    for (int i = 0; i < 4; i++) g.DrawEllipse(pen, Width - (300 + i * 28) * scale, -100 * scale, (260 + i * 56) * scale, (260 + i * 56) * scale);
                }
                g.Restore(saved);
            }
        }
    }
}

internal sealed class ActionButton : Button {
    public bool Primary;
    bool hover, pressed;
    public ActionButton() {
        SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
        FlatStyle = FlatStyle.Flat; FlatAppearance.BorderSize = 0; Cursor = Cursors.Hand;
        UseVisualStyleBackColor = false;
    }
    protected override void OnMouseEnter(EventArgs e) { hover = true; Invalidate(); base.OnMouseEnter(e); }
    protected override void OnMouseLeave(EventArgs e) { hover = pressed = false; Invalidate(); base.OnMouseLeave(e); }
    protected override void OnMouseDown(MouseEventArgs e) { pressed = true; Invalidate(); base.OnMouseDown(e); }
    protected override void OnMouseUp(MouseEventArgs e) { pressed = false; Invalidate(); base.OnMouseUp(e); }
    protected override void OnPaint(PaintEventArgs e) {
        var g = e.Graphics; g.Clear(BackColor); g.SmoothingMode = SmoothingMode.AntiAlias;
        Color fill = !Enabled ? Color.FromArgb(237, 241, 239) : Primary ? (pressed ? Color.FromArgb(22, 73, 56) : hover ? Color.FromArgb(29, 89, 69) : Palette.Green) : (hover ? Color.FromArgb(232, 241, 236) : Color.White);
        using (var path = Palette.Round(new RectangleF(1, 1, Width - 3, Height - 3), 9 * g.DpiX / 96F)) {
            using (var brush = new SolidBrush(fill)) g.FillPath(brush, path);
            if (!Primary && Enabled) using (var pen = new Pen(Palette.Line)) g.DrawPath(pen, path);
        }
        TextRenderer.DrawText(g, Text, Font, ClientRectangle, !Enabled ? Color.FromArgb(151, 165, 157) : Primary ? Color.White : Palette.Ink, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.SingleLine);
        if (Focused && ShowFocusCues) ControlPaint.DrawFocusRectangle(g, Rectangle.Inflate(ClientRectangle, -6, -6), Palette.Ink, fill);
    }
}

internal sealed class ServiceGlyph : Control {
    readonly bool model;
    public ServiceGlyph(bool isModel) { model = isModel; Size = new Size(44, 44); BackColor = Color.White; }
    protected override void OnPaint(PaintEventArgs e) {
        var g = e.Graphics; g.SmoothingMode = SmoothingMode.AntiAlias;
        g.ScaleTransform(Width / 44F, Height / 44F);
        using (var path = Palette.Round(new RectangleF(0, 0, 43, 43), 12))
        using (var brush = new SolidBrush(model ? Color.FromArgb(234, 241, 255) : Color.FromArgb(231, 243, 236))) g.FillPath(brush, path);
        using (var pen = new Pen(model ? Color.FromArgb(78, 103, 179) : Palette.Green, 1.7F)) {
            pen.StartCap = pen.EndCap = LineCap.Round;
            if (model) {
                g.DrawRectangle(pen, 13, 13, 18, 18); g.DrawRectangle(pen, 18, 18, 8, 8);
                for (int i = 16; i <= 28; i += 6) { g.DrawLine(pen, i, 9, i, 13); g.DrawLine(pen, i, 31, i, 35); g.DrawLine(pen, 9, i, 13, i); g.DrawLine(pen, 31, i, 35, i); }
            } else {
                g.DrawRectangle(pen, 13, 10, 19, 25); g.DrawLine(pen, 18, 17, 27, 17); g.DrawLine(pen, 18, 22, 27, 22); g.DrawLine(pen, 18, 27, 24, 27);
            }
        }
    }
}
