using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace NodeImport
{
    public class MainForm : Form
    {
        private readonly AppConfig _config;
        private PasarelaApi _api;
        private List<PedidoPasarela> _pedidos;
        private HashSet<string> _importados = new(StringComparer.OrdinalIgnoreCase);
        private readonly SemaphoreSlim _comLock = new(1, 1);
        private CliArgs _restoreArgs;
        private bool _selTodosActivo;

        // Controles
        private ComboBox _cboEstado;
        private DateTimePicker _dtpDesde;
        private DateTimePicker _dtpHasta;
        private Button _btnConsultar;
        private Button _btnImportar;
        private Button _btnTestConexion;
        private Button _btnFiltrarPendientes;
        private bool _filtrandoPendientes = true;
        private DataGridView _grid;
        private RichTextBox _txtLog;
        private StatusStrip _statusBar;
        private ToolStripStatusLabel _lblEstado;
        private ToolStripStatusLabel _lblEmpresa;
        private ToolStripStatusLabel _lblRegistros;

        public MainForm(AppConfig config, CliArgs restoreArgs = null)
        {
            _config = config;
            _restoreArgs = restoreArgs;
            _api = new PasarelaApi(config.Pasarela);
            _pedidos = new List<PedidoPasarela>();

            InicializarComponentes();

            if (_restoreArgs != null)
            {
                if (!string.IsNullOrEmpty(_restoreArgs.LogFile) && File.Exists(_restoreArgs.LogFile))
                {
                    try
                    {
                        _txtLog.Rtf = File.ReadAllText(_restoreArgs.LogFile);
                        File.Delete(_restoreArgs.LogFile);
                    }
                    catch (Exception exLog)
                    {
                        Logger.Error($"Error restaurando log: {exLog.Message}");
                    }
                }
                _dtpDesde.Value = _restoreArgs.Desde;
                _dtpHasta.Value = _restoreArgs.Hasta;
                if (!string.IsNullOrEmpty(_restoreArgs.Estado))
                {
                    var idx = _cboEstado.Items.IndexOf(_restoreArgs.Estado);
                    if (idx >= 0) _cboEstado.SelectedIndex = idx;
                }
            }
            else
            {
                Log("Aplicacion iniciada");
                Log($"Pasarela: {config.Pasarela.Url} | Empresa: {config.Pasarela.Empresa}");
                if (!string.IsNullOrEmpty(config.A3Erp?.Empresa))
                    Log($"A3ERP empresa: {config.A3Erp.Empresa}");
            }
        }

        private void InicializarComponentes()
        {
            Text = "NodeImport — Importador SaycuNode → A3ERP v1.0";
            Size = new Size(1100, 800);
            MinimumSize = new Size(900, 650);
            Padding = new Padding(10, 5, 10, 8);
            Font = new Font("Segoe UI", 9F);

            if (_restoreArgs?.Bounds is Rectangle b)
            {
                StartPosition = FormStartPosition.Manual;
                Bounds = b;
            }
            else
            {
                StartPosition = FormStartPosition.CenterScreen;
            }

            if (_restoreArgs != null)
                Opacity = 0;

            TopMost = true;

            using (var stream = GetType().Assembly.GetManifestResourceStream("app.ico"))
            {
                if (stream != null)
                    Icon = new Icon(stream);
            }

            // Cabecera corporativa
            var headerBar = new Panel
            {
                Dock = DockStyle.Top,
                Height = 38,
                BackColor = Color.FromArgb(43, 76, 126)
            };
            var lblHeader = new Label
            {
                Text = "NODEIMPORT — Importador SaycuNode → A3ERP v1.0",
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 13F, FontStyle.Bold),
                AutoSize = false,
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleCenter
            };
            headerBar.Controls.Add(lblHeader);

            // Panel superior: filtros
            var panelSuperior = new GroupBox
            {
                Text = "Consulta de pedidos en SaycuNode",
                Dock = DockStyle.Top,
                Height = 100,
                Padding = new Padding(10, 5, 10, 5)
            };

            var lblEstado = new Label
            {
                Text = "Estado:",
                Location = new Point(15, 22),
                AutoSize = true
            };

            _cboEstado = new ComboBox
            {
                Location = new Point(75, 19),
                Width = 160,
                DropDownStyle = ComboBoxStyle.DropDownList
            };
            _cboEstado.Items.AddRange(new object[]
                { "(Todos)", "PENDIENTE", "LEIDO", "ACEPTADO", "INICIADO", "TERMINADO" });
            _cboEstado.SelectedIndex = 1;

            var lblProv = new Label
            {
                Text = "Proveedor:",
                Location = new Point(250, 22),
                AutoSize = true,
                ForeColor = Color.Gray
            };
            var lblProvVal = new Label
            {
                Text = _config.Pasarela.Empresa ?? "(no definido)",
                Location = new Point(320, 22),
                AutoSize = true,
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };

            // Fila 2: fechas + consultar
            var lblDesde = new Label
            {
                Text = "Desde:",
                Location = new Point(15, 58),
                AutoSize = true
            };
            _dtpDesde = new DateTimePicker
            {
                Location = new Point(65, 55),
                Width = 130,
                Format = DateTimePickerFormat.Short,
                Value = DateTime.Today.AddDays(-30)
            };

            var lblHasta = new Label
            {
                Text = "Hasta:",
                Location = new Point(215, 58),
                AutoSize = true
            };
            _dtpHasta = new DateTimePicker
            {
                Location = new Point(265, 55),
                Width = 130,
                Format = DateTimePickerFormat.Short,
                Value = DateTime.Today
            };

            _btnConsultar = new Button
            {
                Text = "Consultar",
                Location = new Point(420, 53),
                Width = 110,
                Height = 28,
                FlatStyle = FlatStyle.System
            };
            _btnConsultar.Click += BtnConsultar_Click;

            panelSuperior.Controls.AddRange(new Control[]
            {
                lblEstado, _cboEstado, lblProv, lblProvVal,
                lblDesde, _dtpDesde, lblHasta, _dtpHasta, _btnConsultar
            });

            // Panel de botones de accion
            var panelAcciones = new Panel
            {
                Dock = DockStyle.Top,
                Height = 40,
                Padding = new Padding(10, 5, 10, 5)
            };

            _btnImportar = new Button
            {
                Text = "Importar seleccionados a A3ERP",
                Location = new Point(10, 5),
                Width = 220,
                Height = 28,
                FlatStyle = FlatStyle.System,
                Enabled = false
            };
            _btnImportar.Click += BtnImportar_Click;

            _btnFiltrarPendientes = new Button
            {
                Text = "✔ Solo pendientes",
                Location = new Point(240, 5),
                Width = 130,
                Height = 28,
                FlatStyle = FlatStyle.System,
                Enabled = false,
                Font = new Font("Segoe UI", 9F, FontStyle.Bold)
            };
            _btnFiltrarPendientes.Click += BtnFiltrarPendientes_Click;

            _btnTestConexion = new Button
            {
                Text = "Test A3ERP",
                Location = new Point(380, 5),
                Width = 100,
                Height = 28,
                FlatStyle = FlatStyle.System
            };
            _btnTestConexion.Click += BtnTestConexion_Click;

            panelAcciones.Controls.AddRange(new Control[]
                { _btnImportar, _btnFiltrarPendientes, _btnTestConexion });

            // Grid
            _grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                AllowUserToResizeRows = false,
                AllowUserToResizeColumns = true,
                ReadOnly = false,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                MultiSelect = true,
                RowHeadersVisible = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.None,
                ScrollBars = ScrollBars.Both,
                ColumnHeadersHeightSizeMode = DataGridViewColumnHeadersHeightSizeMode.DisableResizing,
                ColumnHeadersHeight = 32,
                BackgroundColor = SystemColors.Window,
                BorderStyle = BorderStyle.Fixed3D,
                AlternatingRowsDefaultCellStyle = new DataGridViewCellStyle
                {
                    BackColor = Color.FromArgb(245, 245, 250)
                }
            };
            _grid.CellClick += Grid_CellClick;
            _grid.CellFormatting += Grid_CellFormatting;

            // Checkbox en cabecera de Sel
            _grid.CellPainting += (s, e) =>
            {
                if (e.RowIndex != -1 || !_grid.Columns.Contains("Sel")) return;
                if (e.ColumnIndex != _grid.Columns["Sel"].Index) return;

                e.PaintBackground(e.CellBounds, true);
                var state = _selTodosActivo
                    ? System.Windows.Forms.VisualStyles.CheckBoxState.CheckedNormal
                    : System.Windows.Forms.VisualStyles.CheckBoxState.UncheckedNormal;
                var cbSize = CheckBoxRenderer.GetGlyphSize(e.Graphics, state);
                var pt = new Point(
                    e.CellBounds.X + (e.CellBounds.Width - cbSize.Width) / 2,
                    e.CellBounds.Y + (e.CellBounds.Height - cbSize.Height) / 2);
                CheckBoxRenderer.DrawCheckBox(e.Graphics, pt, state);
                e.Handled = true;
            };

            // Topo de color en columna Ver
            _grid.CellPainting += (s, e) =>
            {
                if (e.RowIndex < 0 || !_grid.Columns.Contains("Ver")) return;
                if (e.ColumnIndex != _grid.Columns["Ver"].Index) return;

                e.PaintBackground(e.CellBounds, true);

                var estado = _grid.Rows[e.RowIndex].Cells["EstadoImport"]?.Value?.ToString() ?? "";
                Color colorTopo;
                switch (estado)
                {
                    case "Importado":
                    case "Ya importado":
                        colorTopo = Color.SeaGreen;
                        break;
                    case "ERROR":
                        colorTopo = Color.Red;
                        break;
                    case "Importando...":
                        colorTopo = Color.DodgerBlue;
                        break;
                    default:
                        colorTopo = Color.Orange;
                        break;
                }

                var d = 8;
                var x = e.CellBounds.Right - d - 4;
                var y = e.CellBounds.Top + (e.CellBounds.Height - d) / 2;
                using (var brush = new SolidBrush(colorTopo))
                {
                    e.Graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
                    e.Graphics.FillEllipse(brush, x, y, d, d);
                }
                e.Handled = true;
            };

            _grid.ColumnHeaderMouseClick += (s, e) =>
            {
                if (!_grid.Columns.Contains("Sel")) return;
                if (_grid.Columns[e.ColumnIndex].Name != "Sel") return;
                _grid.EndEdit();
                _selTodosActivo = !_selTodosActivo;
                SeleccionarTodos(_selTodosActivo);
                _grid.InvalidateCell(e.ColumnIndex, -1);
            };

            // Panel de log
            var panelLog = new GroupBox
            {
                Text = "Registro de operaciones",
                Dock = DockStyle.Bottom,
                Height = 160,
                Padding = new Padding(5)
            };

            _txtLog = new RichTextBox
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                Font = new Font("Consolas", 8.5F),
                BackColor = Color.FromArgb(30, 30, 30),
                ForeColor = Color.FromArgb(220, 220, 220),
                BorderStyle = BorderStyle.None
            };
            panelLog.Controls.Add(_txtLog);

            // Barra de estado
            _statusBar = new StatusStrip
            {
                BackColor = Color.FromArgb(43, 76, 126),
                SizingGrip = false
            };
            _statusBar.Renderer = new ToolStripProfessionalRenderer(new StatusBarColorTable());
            _lblEstado = new ToolStripStatusLabel
            {
                Text = "Listo",
                Spring = true,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = Color.White
            };
            _lblEmpresa = new ToolStripStatusLabel
            {
                Text = $"A3: {_config.A3Erp?.Empresa ?? "(no config)"} | Pasarela: {_config.Pasarela.Empresa}",
                BorderSides = ToolStripStatusLabelBorderSides.Left,
                ForeColor = Color.White
            };
            _lblRegistros = new ToolStripStatusLabel
            {
                Text = "0 pedidos",
                BorderSides = ToolStripStatusLabelBorderSides.Left,
                ForeColor = Color.White
            };
            _statusBar.Items.AddRange(new ToolStripItem[]
                { _lblEstado, _lblEmpresa, _lblRegistros });

            // Agregar (orden inverso por Dock)
            Controls.Add(_grid);
            Controls.Add(panelAcciones);
            Controls.Add(panelSuperior);
            Controls.Add(headerBar);
            Controls.Add(panelLog);
            Controls.Add(_statusBar);
        }

        // — Consultar pedidos —

        private async void BtnConsultar_Click(object sender, EventArgs e)
        {
            _btnConsultar.Enabled = false;
            _btnImportar.Enabled = false;
            Cursor = Cursors.WaitCursor;
            _lblEstado.Text = "Consultando pedidos...";

            try
            {
                string estado = _cboEstado.SelectedIndex > 0
                    ? _cboEstado.SelectedItem.ToString()
                    : null;

                Log($"Consultando pedidos (estado: {estado ?? "todos"})...");

                var pedidos = await _api.ListarTodosPedidos(estado);

                var desde = _dtpDesde.Value.Date;
                var hasta = _dtpHasta.Value.Date;
                _pedidos = pedidos.Where(p =>
                {
                    if (string.IsNullOrEmpty(p.FechaEfectiva)) return true;
                    if (DateTime.TryParse(p.FechaEfectiva, out var fecha))
                        return fecha.Date >= desde && fecha.Date <= hasta;
                    return true;
                }).ToList();

                Log($"Encontrados: {_pedidos.Count} pedidos (de {pedidos.Count} en API)");

                // Consultar ya importados via SQL
                await ConsultarImportadosAsync();

                CargarGrid();
                _btnFiltrarPendientes.Enabled = true;
                _lblEstado.Text = "Listo";
                _lblRegistros.Text = $"{_pedidos.Count} pedidos";
            }
            catch (Exception ex)
            {
                Log($"Error consultando: {ex.Message}", Color.Red);
                Logger.Error("BtnConsultar", ex);
                _lblEstado.Text = "Error";

                ErrorHelper.MostrarErrorConexion("Pasarela API", ex, this);
            }
            finally
            {
                _btnConsultar.Enabled = true;
                Cursor = Cursors.Default;
            }
        }

        private async Task ConsultarImportadosAsync()
        {
            if (_config.A3Erp == null || string.IsNullOrEmpty(_config.A3Erp.Empresa))
            {
                Log("A3ERP no configurada: no se consultaran importados previos.", Color.Gray);
                return;
            }

            try
            {
                var empresa = _config.A3Erp.Empresa;
                _importados = await Task.Run(() =>
                {
                    using var erp = new A3ErpService(_config);
                    return erp.ObtenerReferenciasImportadasSql(empresa);
                });
                Log($"Ya importados en A3: {_importados.Count} registros NI-*", Color.Gray);
            }
            catch (Exception ex)
            {
                Log($"Aviso: no se pudieron consultar importados previos: {ex.Message}", Color.DarkGoldenrod);
                Logger.Error("ConsultarImportados", ex);
            }
        }

        // — Grid —

        private void CargarGrid()
        {
            _grid.Columns.Clear();
            _grid.Rows.Clear();
            _selTodosActivo = false;

            // Columnas
            _grid.Columns.Add(new DataGridViewCheckBoxColumn
            {
                Name = "Sel",
                HeaderText = "",
                Width = 30,
                ReadOnly = false
            });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Ver", HeaderText = "", Width = 20, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Id", HeaderText = "ID", Width = 60, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "NumeroPedido", HeaderText = "Num. Pedido", Width = 110, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Proveedor", HeaderText = "Proveedor", Width = 100, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Tipo", HeaderText = "Tipo", Width = 65, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "EstadoApi", HeaderText = "Estado API", Width = 90, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Fecha", HeaderText = "Fecha", Width = 85, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "ClienteCodigo", HeaderText = "Cliente", Width = 85, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "TerceroCodigo", HeaderText = "Tercero", Width = 85, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Tractor", HeaderText = "Tractor", Width = 90, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Remolque", HeaderText = "Remolque", Width = 90, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "Albaranes", HeaderText = "Albaranes", Width = 100, ReadOnly = true });
            _grid.Columns.Add(new DataGridViewTextBoxColumn { Name = "EstadoImport", HeaderText = "Import", Width = 90, ReadOnly = true });

            var pedidosAMostrar = _filtrandoPendientes
                ? _pedidos.Where(p => !_importados.Contains(p.Id.ToString())).ToList()
                : _pedidos;

            foreach (var p in pedidosAMostrar)
            {
                bool yaImportado = _importados.Contains(p.Id.ToString());
                string estadoImport = yaImportado ? "Ya importado" : "Pendiente";
                string fechaStr = "";
                if (!string.IsNullOrEmpty(p.FechaEfectiva) && DateTime.TryParse(p.FechaEfectiva, out var dt))
                    fechaStr = dt.ToString("dd/MM/yyyy");

                _grid.Rows.Add(
                    !yaImportado,   // Sel: marcado si pendiente
                    "",             // Ver (pintado custom)
                    p.Id,
                    p.NumeroPedido,
                    p.ProveedorCodigo,
                    p.Tipo,
                    p.Estado,
                    fechaStr,
                    p.ClienteCodigo,
                    p.TerceroCodigo,
                    p.MatriculaTractor,
                    p.MatriculaRemolque,
                    p.AlbaranesConcatenados,
                    estadoImport
                );

                if (yaImportado)
                    _grid.Rows[_grid.Rows.Count - 1].DefaultCellStyle.ForeColor = Color.Gray;
            }

            _btnImportar.Enabled = pedidosAMostrar.Any(p => !_importados.Contains(p.Id.ToString()));
        }

        private void Grid_CellClick(object sender, DataGridViewCellEventArgs e)
        {
            if (e.RowIndex < 0) return;
            if (_grid.Columns[e.ColumnIndex].Name == "Sel")
            {
                var cell = (DataGridViewCheckBoxCell)_grid.Rows[e.RowIndex].Cells["Sel"];
                cell.Value = !(bool)(cell.Value ?? false);
                _grid.EndEdit();
            }
        }

        private void Grid_CellFormatting(object sender, DataGridViewCellFormattingEventArgs e)
        {
            if (e.RowIndex < 0) return;
            var colName = _grid.Columns[e.ColumnIndex].Name;

            if (colName == "EstadoImport")
            {
                var val = e.Value?.ToString() ?? "";
                switch (val)
                {
                    case "Importado":
                    case "Ya importado":
                        e.CellStyle.ForeColor = Color.SeaGreen;
                        e.CellStyle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
                        break;
                    case "ERROR":
                        e.CellStyle.ForeColor = Color.Red;
                        e.CellStyle.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
                        break;
                    case "Importando...":
                        e.CellStyle.ForeColor = Color.DodgerBlue;
                        break;
                }
            }

            if (colName == "Proveedor")
            {
                var val = e.Value?.ToString() ?? "";
                if (val.Contains("satelles", StringComparison.OrdinalIgnoreCase))
                    e.CellStyle.ForeColor = Color.FromArgb(0, 100, 170);
                else if (val.Contains("pcs", StringComparison.OrdinalIgnoreCase))
                    e.CellStyle.ForeColor = Color.FromArgb(170, 80, 0);
            }
        }

        private void SeleccionarTodos(bool seleccionar)
        {
            foreach (DataGridViewRow row in _grid.Rows)
            {
                var estadoCell = row.Cells["EstadoImport"]?.Value?.ToString() ?? "";
                if (estadoCell == "Ya importado") continue;
                row.Cells["Sel"].Value = seleccionar;
            }
        }

        private void BtnFiltrarPendientes_Click(object sender, EventArgs e)
        {
            _filtrandoPendientes = !_filtrandoPendientes;
            _btnFiltrarPendientes.Text = _filtrandoPendientes ? "✔ Solo pendientes" : "Todos";
            CargarGrid();
        }

        // — Importar —

        private async void BtnImportar_Click(object sender, EventArgs e)
        {
            var seleccionados = new List<long>();
            foreach (DataGridViewRow row in _grid.Rows)
            {
                if ((bool)(row.Cells["Sel"].Value ?? false))
                {
                    var id = Convert.ToInt64(row.Cells["Id"].Value);
                    var estado = row.Cells["EstadoImport"]?.Value?.ToString() ?? "";
                    if (estado != "Ya importado" && estado != "Importado")
                        seleccionados.Add(id);
                }
            }

            if (seleccionados.Count == 0)
            {
                Log("No hay pedidos seleccionados para importar.", Color.DarkGoldenrod);
                return;
            }

            var empresaA3 = _config.A3Erp?.Empresa;
            if (string.IsNullOrEmpty(empresaA3))
            {
                Log("Error: empresa A3 no configurada (a3erp.empresa en config.json).", Color.Red);
                return;
            }

            var importCfg = _config.Import ?? new ImportSettings();
            if (string.IsNullOrEmpty(importCfg.CodCliA3))
            {
                Log("Error: falta import.codCliA3 en config.json.", Color.Red);
                return;
            }

            _btnImportar.Enabled = false;
            _btnConsultar.Enabled = false;
            Cursor = Cursors.WaitCursor;

            Log($"Importando {seleccionados.Count} pedido(s) a A3ERP ({empresaA3})...", Color.DodgerBlue);
            _lblEstado.Text = $"Importando 0/{seleccionados.Count}...";

            int ok = 0, errores = 0;

            try
            {
                int i = 0;
                foreach (var pedidoId in seleccionados)
                {
                    i++;
                    _lblEstado.Text = $"Importando {i}/{seleccionados.Count}...";

                    // Marcar en grid
                    var gridRow = BuscarFilaGrid(pedidoId);
                    if (gridRow != null)
                        gridRow.Cells["EstadoImport"].Value = "Importando...";
                    _grid.Refresh();

                    var pedido = _pedidos.FirstOrDefault(p => p.Id == pedidoId);
                    if (pedido == null) continue;

                    try
                    {
                        var detalle = await _api.ObtenerPedido(pedidoId);

                        string codArt = detalle.EsSatelles
                            ? importCfg.CodArtSatelles
                            : importCfg.CodArtPcs;

                        var resultado = await RunStaImportAsync(() =>
                        {
                            using var erp = new A3ErpService(_config);
                            erp.Conectar(empresaA3);

                            if (string.IsNullOrEmpty(codArt))
                                codArt = erp.CrearArticuloSiNoExiste(
                                    detalle.EsSatelles ? "SERVICIO TRANSPORTE SATELLES" : "SERVICIO TRANSPORTE PCS");

                            return detalle.EsSatelles
                                ? erp.ImportarSatelles(detalle, importCfg.CodCliA3, codArt)
                                : erp.ImportarPcsValencia(detalle, importCfg.CodCliA3, codArt);
                        });

                        if (resultado.Exito)
                        {
                            ok++;
                            _importados.Add(pedidoId.ToString());
                            if (gridRow != null)
                                gridRow.Cells["EstadoImport"].Value = "Importado";

                            Log($"  OK #{pedidoId} → {resultado.Mensaje}", Color.LimeGreen);

                            if (!string.IsNullOrEmpty(importCfg.CambiarEstadoTras))
                            {
                                try
                                {
                                    await _api.CambiarEstado(pedidoId, importCfg.CambiarEstadoTras);
                                    Log($"  Estado pasarela → {importCfg.CambiarEstadoTras}", Color.Gray);
                                }
                                catch (Exception exEst)
                                {
                                    Log($"  Aviso: no se pudo cambiar estado en pasarela: {exEst.Message}", Color.DarkGoldenrod);
                                }
                            }
                        }
                        else
                        {
                            errores++;
                            if (gridRow != null)
                                gridRow.Cells["EstadoImport"].Value = "ERROR";
                            Log($"  ERROR #{pedidoId}: {resultado.Error}", Color.Red);
                        }
                    }
                    catch (Exception exPedido)
                    {
                        errores++;
                        if (gridRow != null)
                            gridRow.Cells["EstadoImport"].Value = "ERROR";
                        Log($"  ERROR #{pedidoId}: {exPedido.Message}", Color.Red);
                        Logger.Error($"Importar pedido {pedidoId}", exPedido);
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"Error general importacion: {ex.Message}", Color.Red);
                Logger.Error("BtnImportar general", ex);
            }
            finally
            {
                _btnImportar.Enabled = true;
                _btnConsultar.Enabled = true;
                Cursor = Cursors.Default;

                var resumen = $"Importacion finalizada: {ok} correctos, {errores} errores";
                Log(resumen, errores > 0 ? Color.Orange : Color.LimeGreen);
                Logger.Info(resumen);
                _lblEstado.Text = resumen;
            }
        }

        private DataGridViewRow BuscarFilaGrid(long pedidoId)
        {
            foreach (DataGridViewRow row in _grid.Rows)
            {
                if (Convert.ToInt64(row.Cells["Id"].Value) == pedidoId)
                    return row;
            }
            return null;
        }

        // — Test conexion A3 —

        private async void BtnTestConexion_Click(object sender, EventArgs e)
        {
            var empresa = _config.A3Erp?.Empresa;
            if (string.IsNullOrEmpty(empresa))
            {
                Log("No hay empresa A3 configurada.", Color.Red);
                return;
            }

            _btnTestConexion.Enabled = false;
            _lblEstado.Text = "Probando conexion A3ERP...";
            Log($"Probando conexion A3ERP (empresa: {empresa})...");

            try
            {
                var resultado = await RunStaImportAsync(() =>
                {
                    using var erp = new A3ErpService(_config);
                    return erp.TestConexionRapida(empresa);
                });

                Log($"Conexion A3ERP: {resultado}", Color.LimeGreen);
                _lblEstado.Text = "Conexion A3ERP OK";
            }
            catch (Exception ex)
            {
                Log($"Error A3ERP: {ex.Message}", Color.Red);
                Logger.Error("TestConexion", ex);
                _lblEstado.Text = "Error A3ERP";
                ErrorHelper.MostrarErrorConexion("A3ERP", ex, this);
            }
            finally
            {
                _btnTestConexion.Enabled = true;
            }
        }

        // — COM STA helper (idéntico a SaycuImportV2) —

        private async Task<T> RunStaImportAsync<T>(Func<T> work)
        {
            await _comLock.WaitAsync();
            try
            {
                var tcs = new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);

                var thread = new Thread(() =>
                {
                    Application.EnableVisualStyles();
                    Application.SetCompatibleTextRenderingDefault(false);

                    var frm = new Form { Opacity = 0, ShowInTaskbar = false, Size = new Size(1, 1) };
                    frm.Load += (s, ev) =>
                    {
                        try
                        {
                            var result = work();
                            tcs.TrySetResult(result);
                        }
                        catch (Exception ex)
                        {
                            tcs.TrySetException(ex);
                        }
                        finally
                        {
                            frm.BeginInvoke((Action)frm.Close);
                        }
                    };
                    Application.Run(frm);
                });
                thread.SetApartmentState(ApartmentState.STA);
                thread.IsBackground = true;
                thread.Start();

                return await tcs.Task;
            }
            finally
            {
                _comLock.Release();
            }
        }

        // — Log —

        private void Log(string mensaje, Color? color = null)
        {
            var c = color ?? Color.FromArgb(220, 220, 220);
            var hora = DateTime.Now.ToString("HH:mm:ss");
            var texto = $"[{hora}] {mensaje}\n";

            if (InvokeRequired)
            {
                BeginInvoke((Action)(() => AppendLog(texto, c)));
            }
            else
            {
                AppendLog(texto, c);
            }

            Logger.Info(mensaje);
        }

        private void AppendLog(string texto, Color color)
        {
            _txtLog.SelectionStart = _txtLog.TextLength;
            _txtLog.SelectionLength = 0;
            _txtLog.SelectionColor = color;
            _txtLog.AppendText(texto);
            _txtLog.ScrollToCaret();
        }

        // — Cleanup —

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _api?.Dispose();
                _comLock?.Dispose();
            }
            base.Dispose(disposing);
        }
    }

    internal class StatusBarColorTable : ProfessionalColorTable
    {
        public override Color StatusStripGradientBegin => Color.FromArgb(43, 76, 126);
        public override Color StatusStripGradientEnd => Color.FromArgb(43, 76, 126);
    }
}
