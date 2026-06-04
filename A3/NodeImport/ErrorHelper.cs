using System;
using System.Drawing;
using System.Windows.Forms;

namespace NodeImport
{
    public static class ErrorHelper
    {
        public static void Mostrar(string titulo, string mensaje, string accionSugerida = null, Exception ex = null, IWin32Window owner = null)
        {
            Logger.Error(mensaje, ex);

            var form = new Form
            {
                Text = $"Error — {titulo}",
                Size = new Size(560, 380),
                MinimumSize = new Size(480, 320),
                StartPosition = FormStartPosition.CenterParent,
                Font = new Font("Segoe UI", 9.5F),
                FormBorderStyle = FormBorderStyle.FixedDialog,
                MaximizeBox = false,
                MinimizeBox = false,
                ShowInTaskbar = false
            };

            if (owner is Form ownerForm)
            {
                form.TopMost = ownerForm.TopMost;
                form.Shown += (s, e) => { form.BringToFront(); form.Activate(); };
            }

            var panelIcono = new PictureBox
            {
                Image = SystemIcons.Error.ToBitmap(),
                SizeMode = PictureBoxSizeMode.CenterImage,
                Size = new Size(48, 48),
                Location = new Point(16, 16)
            };

            var lblMensaje = new Label
            {
                Text = mensaje,
                Location = new Point(76, 16),
                Size = new Size(450, 50),
                Font = new Font("Segoe UI", 10F, FontStyle.Bold),
                AutoSize = false
            };

            int y = 76;

            Label lblAccion = null;
            if (!string.IsNullOrEmpty(accionSugerida))
            {
                lblAccion = new Label
                {
                    Text = accionSugerida,
                    Location = new Point(76, y),
                    Size = new Size(450, 40),
                    ForeColor = Color.FromArgb(0, 100, 170),
                    AutoSize = false
                };
                y += 48;
            }

            TextBox txtDetalle = null;
            if (ex != null)
            {
                var lblDetalle = new Label
                {
                    Text = "Detalle:",
                    Location = new Point(16, y),
                    AutoSize = true,
                    Font = new Font("Segoe UI", 8.5F, FontStyle.Bold),
                    ForeColor = Color.DimGray
                };
                y += 22;

                var detalleTexto = $"{ex.GetType().Name}: {ex.Message}";
                if (ex.InnerException != null)
                    detalleTexto += $"\n\n-> {ex.InnerException.GetType().Name}: {ex.InnerException.Message}";
                detalleTexto += $"\n\nStack trace:\n{ex.StackTrace}";

                txtDetalle = new TextBox
                {
                    Text = detalleTexto,
                    Location = new Point(16, y),
                    Size = new Size(510, 160),
                    Multiline = true,
                    ReadOnly = true,
                    ScrollBars = ScrollBars.Vertical,
                    Font = new Font("Consolas", 8F),
                    BackColor = Color.FromArgb(250, 245, 245),
                    ForeColor = Color.FromArgb(120, 30, 30)
                };
                y += 168;

                form.Controls.Add(lblDetalle);
            }

            var btnCopiar = new Button
            {
                Text = "Copiar detalle",
                Location = new Point(16, y + 8),
                Width = 120,
                Height = 30,
                FlatStyle = FlatStyle.System,
                Visible = ex != null
            };
            btnCopiar.Click += (s, ev) =>
            {
                var texto = $"[{titulo}] {mensaje}";
                if (ex != null)
                    texto += $"\n\n{ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}";
                try { Clipboard.SetText(texto); } catch { }
                ((Button)s).Text = "Copiado";
            };

            var btnCerrar = new Button
            {
                Text = "Cerrar",
                Location = new Point(form.ClientSize.Width - 100, y + 8),
                Width = 80,
                Height = 30,
                FlatStyle = FlatStyle.System,
                DialogResult = DialogResult.OK
            };
            form.AcceptButton = btnCerrar;

            form.Controls.Add(panelIcono);
            form.Controls.Add(lblMensaje);
            if (lblAccion != null) form.Controls.Add(lblAccion);
            if (txtDetalle != null) form.Controls.Add(txtDetalle);
            form.Controls.Add(btnCopiar);
            form.Controls.Add(btnCerrar);

            form.ClientSize = new Size(540, y + 50);
            form.ShowDialog(owner);
            form.Dispose();
        }

        public static void MostrarErrorConexion(string servicio, Exception ex, IWin32Window owner = null)
        {
            Mostrar(
                $"Error de conexion - {servicio}",
                $"No se pudo conectar con {servicio}.",
                $"Verifique que el servicio este accesible y que los datos de conexion en config.json sean correctos.",
                ex, owner);
        }
    }
}
