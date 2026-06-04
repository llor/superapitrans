; ============================================================================
; NodeImport_Setup.iss — Instalador NodeImport (Nodo API → A3 ERP)
; Compilar desde C:\Saycusoft\NodeImport\Instalador:
;   "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" NodeImport_Setup.iss
;
; Instala SIEMPRE en C:\Saycusoft\NodeImport\ (sin version).
; Las actualizaciones sobreescriben la misma carpeta.
; A3 ERP llama al .exe en esa carpeta fija.
;
; Requisitos previos:
;   - A3 ERP instalado (busca saycuwmodelos.menu)
;   - URL Pasarela API + API Key validos
; ============================================================================

#define MyAppName "NodeImport"
#define MyAppVersion "1.0"
#define MyAppPublisher "SAYCUSOFT S.L.U."
#define MyAppExeName "NodeImport.exe"
#define PublishDir "..\bin\Publish"

[Setup]
AppId={{D4A1B7E2-8F53-4C9A-B612-NODEIMPORT01}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppCopyright=SAYCUSOFT S.L.U.
DefaultDirName=C:\Saycusoft\NodeImport
DisableDirPage=no
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=NodeImport_v{#MyAppVersion}_Setup
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
UninstallDisplayName={#MyAppName} v{#MyAppVersion}
VersionInfoVersion={#MyAppVersion}.0.0
VersionInfoCompany=SAYCUSOFT S.L.U.
VersionInfoCopyright=SAYCUSOFT S.L.U.

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Accesos directos:"; Flags: unchecked

[Files]
; config.json lo genera el [Code], se excluye aqui
Source: "{#PublishDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "log\*,*.log,*.pdb,config.json"

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Ejecutar {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
// ===================================================================
// Variables globales
// ===================================================================
var
  PasarelaPage: TInputQueryWizardPage;
  A3CredPage: TInputQueryWizardPage;
  ImportPage: TInputQueryWizardPage;
  MenuFilePath: String;
  A3BasePath: String;

// ===================================================================
// Busqueda recursiva de archivos .menu de A3 ERP
// ===================================================================
function FindMenuFile(RootDir: String): String;
var
  FindRec: TFindRec;
  SubResult: String;
begin
  Result := '';

  if FindFirst(RootDir + '\*.menu', FindRec) then
  begin
    try
      repeat
        if (FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) = 0 then
        begin
          if (Lowercase(FindRec.Name) = 'saycuwmodelos.menu') or
             (Lowercase(FindRec.Name) = 'saycumodelos.menu') then
          begin
            Result := RootDir + '\' + FindRec.Name;
            Exit;
          end;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;

  if FindFirst(RootDir + '\*', FindRec) then
  begin
    try
      repeat
        if ((FindRec.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0) and
           (FindRec.Name <> '.') and (FindRec.Name <> '..') then
        begin
          SubResult := FindMenuFile(RootDir + '\' + FindRec.Name);
          if SubResult <> '' then
          begin
            Result := SubResult;
            Exit;
          end;
        end;
      until not FindNext(FindRec);
    finally
      FindClose(FindRec);
    end;
  end;
end;

function LocateA3Menu(): String;
begin
  Result := '';
  if DirExists('C:\Program Files (x86)\A3') then
    Result := FindMenuFile('C:\Program Files (x86)\A3');
  if (Result = '') and DirExists('C:\Program Files\A3') then
    Result := FindMenuFile('C:\Program Files\A3');
  if (Result = '') and DirExists('D:\A3') then
    Result := FindMenuFile('D:\A3');
end;

// ===================================================================
// Buscar directorio base de A3 ERP (sin necesitar .menu)
// ===================================================================
function LocateA3Base(): String;
begin
  Result := '';
  if DirExists('C:\Program Files (x86)\A3\A3Erp') then
    Result := 'C:\Program Files (x86)\A3'
  else if DirExists('C:\Program Files\A3\A3Erp') then
    Result := 'C:\Program Files\A3'
  else if DirExists('D:\A3\A3Erp') then
    Result := 'D:\A3';
end;

// ===================================================================
// Crear .menu nuevo en ambas rutas estandar de A3 via PowerShell
// (maneja carpeta Menús con tilde y escritura UTF-8)
// Incluye AMBAS entradas: SaycuImport (SS_IMP) + NodeImport (NI_IMP)
// ===================================================================
procedure CreateMenuFiles(ExePath: String);
var
  PsScript, TmpPs1: String;
  ResultCode: Integer;
begin
  TmpPs1 := ExpandConstant('{tmp}\create_menu.ps1');

  PsScript :=
    '$basePath = ''' + A3BasePath + '''' + #13#10 +
    '$exePath = ''' + ExePath + '''' + #13#10 +
    '$utf8NoBom = New-Object System.Text.UTF8Encoding($false)' + #13#10 +
    '$menuFolder = "Men" + [char]250 + "s"' + #13#10 +
    '$menuContent = @''' + #13#10 +
    '<?xml version="1.0" encoding="utf-8"?>' + #13#10 +
    '<NAVEGADOR>' + #13#10 +
    '    <MENUS>' + #13#10 +
    '        <GRUPO Titulo="Procesos Auxiliares SaycuSoft" Imagen="c:/saycusoft/sswmodelos.bmp" IdOrd="210001">' + #13#10 +
    '            <CATEGORIAS>' + #13#10 +
    '                <CATEGORIA Titulo="Procesos Auxiliares SaycuSoft" Imagen="c:/saycusoft/ssmodelos.bmp" IdOrd="210002">' + #13#10 +
    '                   <OPCIONES>' + #13#10 +
    '                       <OPCION Titulo="NodeImport - Importar Nodo API" Imagen="c:/saycusoft/ssconciliab.bmp" Externa="T" Id="NI_IMP" Programa="EXEPATH_PLACEHOLDER" Parametros=":Empresa :Usuario :Password" IdOrd="210007" Categoria="Externa"></OPCION>' + #13#10 +
    '                   </OPCIONES>' + #13#10 +
    '                </CATEGORIA>' + #13#10 +
    '            </CATEGORIAS>' + #13#10 +
    '        </GRUPO>' + #13#10 +
    '    </MENUS>' + #13#10 +
    '</NAVEGADOR>' + #13#10 +
    '''@' + #13#10 +
    '$menuContent = $menuContent -replace "EXEPATH_PLACEHOLDER", $exePath' + #13#10 +
    '$paths = @(' + #13#10 +
    '  (Join-Path $basePath ("A3Erp\Extensiones\saycusoft\MODELOS\" + $menuFolder)),' + #13#10 +
    '  (Join-Path $basePath ("ERP\Sistema.Custom\Sistema\Extensiones\saycusoft\MODELOS\" + $menuFolder))' + #13#10 +
    ')' + #13#10 +
    'foreach ($p in $paths) {' + #13#10 +
    '  if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }' + #13#10 +
    '  $menuFile = Join-Path $p "saycuwmodelos.menu"' + #13#10 +
    '  [System.IO.File]::WriteAllText($menuFile, $menuContent, $utf8NoBom)' + #13#10 +
    '}';

  SaveStringToFile(TmpPs1, PsScript, False);
  Log('PowerShell create menu script: ' + TmpPs1);

  if Exec('powershell.exe',
    '-ExecutionPolicy Bypass -NoProfile -File "' + TmpPs1 + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Log('PowerShell create menu exitCode=' + IntToStr(ResultCode))
  else
    Log('Error al ejecutar PowerShell para crear menu');

  DeleteFile(TmpPs1);
end;

// ===================================================================
// Leer valores existentes de config.json (si existe)
// ===================================================================
function ExtractJsonValue(Content, Key: String): String;
var
  SearchStr: String;
  StartPos, EndPos: Integer;
begin
  Result := '';
  SearchStr := '"' + Key + '":';
  StartPos := Pos(SearchStr, Content);
  if StartPos > 0 then
  begin
    StartPos := StartPos + Length(SearchStr);
    while (StartPos <= Length(Content)) and (Content[StartPos] <> '"') do
      StartPos := StartPos + 1;
    StartPos := StartPos + 1;
    EndPos := StartPos;
    while (EndPos <= Length(Content)) and (Content[EndPos] <> '"') do
      EndPos := EndPos + 1;
    Result := Copy(Content, StartPos, EndPos - StartPos);
  end;
end;

// ===================================================================
// Validacion HTTP con WinHTTP (Bearer auth)
// ===================================================================
function ValidatePasarela(Url, Empresa, ApiKey: String): String;
var
  WinHttpReq: Variant;
  FullUrl: String;
  StatusCode: Integer;
begin
  Result := '';

  if (Length(Url) > 0) and (Url[Length(Url)] = '/') then
    Url := Copy(Url, 1, Length(Url) - 1);

  try
    WinHttpReq := CreateOleObject('WinHttp.WinHttpRequest.5.1');
  except
    Result := 'No se pudo crear el cliente HTTP (WinHttp no disponible).';
    Exit;
  end;

  // 1. Comprobar que el servidor responde
  try
    FullUrl := Url + '/health';
    WinHttpReq.Open('GET', FullUrl, False);
    WinHttpReq.SetTimeouts(5000, 5000, 10000, 10000);
    WinHttpReq.Send('');
    StatusCode := WinHttpReq.Status;
    if StatusCode <> 200 then
    begin
      Result := 'El servidor no responde correctamente.' + #13#10 +
                'URL: ' + FullUrl + #13#10 +
                'Codigo HTTP: ' + IntToStr(StatusCode);
      Exit;
    end;
  except
    Result := 'No se puede conectar con el servidor.' + #13#10 +
              'URL: ' + Url + #13#10 +
              'Verifique que la URL es correcta y el servidor esta activo.';
    Exit;
  end;

  // 2. Validar API key + empresa
  try
    FullUrl := Url + '/datos/pedidos?limit=1';
    WinHttpReq.Open('GET', FullUrl, False);
    WinHttpReq.SetTimeouts(5000, 5000, 10000, 10000);
    WinHttpReq.SetRequestHeader('Authorization', 'Bearer ' + ApiKey);
    WinHttpReq.Send('');
    StatusCode := WinHttpReq.Status;
    if StatusCode = 401 then
    begin
      Result := 'API Key no valida.' + #13#10 +
                'Verifique que la API Key es correcta.';
      Exit;
    end;
    if StatusCode = 403 then
    begin
      Result := 'Acceso denegado para la empresa "' + Empresa + '".' + #13#10 +
                'La API Key no tiene permisos para esta empresa.';
      Exit;
    end;
    if StatusCode = 404 then
    begin
      Result := 'Empresa "' + Empresa + '" no encontrada en la Pasarela.' + #13#10 +
                'Verifique que el codigo de empresa es correcto.';
      Exit;
    end;
    if (StatusCode < 200) or (StatusCode >= 300) then
    begin
      Result := 'Error al validar la configuracion.' + #13#10 +
                'URL: ' + FullUrl + #13#10 +
                'Codigo HTTP: ' + IntToStr(StatusCode);
      Exit;
    end;
  except
    Result := 'Error al validar la API Key contra el servidor.' + #13#10 +
              'URL: ' + FullUrl;
    Exit;
  end;

  Result := '';
end;

// ===================================================================
// Actualizar o añadir entrada NI_IMP en el .menu de A3 via PowerShell
// ===================================================================
procedure UpdateOrAddMenuEntry(MenuFile, ExePath: String);
var
  PsScript, TmpPs1: String;
  ResultCode: Integer;
begin
  TmpPs1 := ExpandConstant('{tmp}\update_menu.ps1');

  PsScript :=
    '$menuPath = ''' + MenuFile + '''' + #13#10 +
    '$exePath = ''' + ExePath + '''' + #13#10 +
    '$utf8NoBom = New-Object System.Text.UTF8Encoding($false)' + #13#10 +
    '$content = [System.IO.File]::ReadAllText($menuPath, $utf8NoBom)' + #13#10 +
    'if ($content -match ''Id="NI_IMP"'') {' + #13#10 +
    '  $content = $content -replace ''(Id="NI_IMP"[^>]*Programa=")[^"]*(")'', (''${1}'' + $exePath + ''${2}'')' + #13#10 +
    '  [System.IO.File]::WriteAllText($menuPath, $content, $utf8NoBom)' + #13#10 +
    '  Write-Host "UPDATED"' + #13#10 +
    '} elseif ($content -match ''</OPCIONES>'') {' + #13#10 +
    '  $newEntry = ''                       <OPCION Titulo="NodeImport - Importar Nodo API" Imagen="c:/saycusoft/ssconciliab.bmp" Externa="T" Id="NI_IMP" Programa="'' + $exePath + ''" Parametros=":Empresa :Usuario :Password" IdOrd="210007" Categoria="Externa"></OPCION>''' + #13#10 +
    '  $content = $content -replace ''(</OPCIONES>)'', ($newEntry + "`r`n" + ''$1'')' + #13#10 +
    '  [System.IO.File]::WriteAllText($menuPath, $content, $utf8NoBom)' + #13#10 +
    '  Write-Host "ADDED"' + #13#10 +
    '} else {' + #13#10 +
    '  Write-Host "NOOP"' + #13#10 +
    '}';

  SaveStringToFile(TmpPs1, PsScript, False);
  Log('PowerShell menu script: ' + TmpPs1);

  if Exec('powershell.exe',
    '-ExecutionPolicy Bypass -NoProfile -File "' + TmpPs1 + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Log('PowerShell menu update exitCode=' + IntToStr(ResultCode))
  else
    Log('Error al ejecutar PowerShell para actualizar menu');

  DeleteFile(TmpPs1);
end;

// ===================================================================
// URL segun modo (produccion por defecto, --dev para desarrollo)
// ===================================================================
function IsDevMode(): Boolean;
var
  i: Integer;
begin
  Result := False;
  for i := 1 to ParamCount do
  begin
    if (Lowercase(ParamStr(i)) = '/dev') or (Lowercase(ParamStr(i)) = '--dev') then
    begin
      Result := True;
      Exit;
    end;
  end;
end;

function GetSelectedUrl(): String;
begin
  if IsDevMode() then
    Result := 'https://dev-api.superapi.eoden.es/pasarela'
  else
    Result := 'https://api.superapi.eoden.es/pasarela';
end;

// ===================================================================
// Generar config.json con los datos introducidos
// ===================================================================
procedure WriteConfigJson(DestDir: String);
var
  Content, Url, Empresa: String;
begin
  Url := GetSelectedUrl();
  Empresa := Uppercase(Trim(PasarelaPage.Values[0]));

  Content :=
    '{' + #13#10 +
    '  "pasarela": {' + #13#10 +
    '    "url": "' + Url + '",' + #13#10 +
    '    "empresa": "' + Empresa + '",' + #13#10 +
    '    "apiKey": "' + Trim(PasarelaPage.Values[1]) + '"' + #13#10 +
    '  },' + #13#10 +
    '  "a3erp": {' + #13#10 +
    '    "empresa": "' + Empresa + '",' + #13#10 +
    '    "usuario": "' + Trim(A3CredPage.Values[0]) + '",' + #13#10 +
    '    "password": "' + Trim(A3CredPage.Values[1]) + '"' + #13#10 +
    '  },' + #13#10 +
    '  "a3sql": {' + #13#10 +
    '    "modoAuth": "windows",' + #13#10 +
    '    "usuario": "",' + #13#10 +
    '    "password": ""' + #13#10 +
    '  },' + #13#10 +
    '  "import": {' + #13#10 +
    '    "codCliA3": "' + Trim(ImportPage.Values[0]) + '",' + #13#10 +
    '    "codArtSatelles": "' + Trim(ImportPage.Values[1]) + '",' + #13#10 +
    '    "codArtPcs": "' + Trim(ImportPage.Values[2]) + '",' + #13#10 +
    '    "cambiarEstadoTras": "LEIDO"' + #13#10 +
    '  }' + #13#10 +
    '}';
  SaveStringToFile(DestDir + '\config.json', Content, False);
  Log('config.json generado en: ' + DestDir);
end;

// ===================================================================
// InitializeSetup: Verificar que A3 ERP existe
// ===================================================================
function InitializeSetup(): Boolean;
begin
  Result := True;
  MenuFilePath := LocateA3Menu();

  if MenuFilePath <> '' then
  begin
    Log('A3 ERP menu encontrado: ' + MenuFilePath);
    A3BasePath := '';
  end
  else
  begin
    A3BasePath := LocateA3Base();
    if A3BasePath = '' then
    begin
      MsgBox(
        'No se ha encontrado A3 ERP en este equipo.' + #13#10 + #13#10 +
        'NodeImport necesita A3 ERP instalado para funcionar.' + #13#10 +
        'Se ha buscado en:' + #13#10 +
        '  - C:\Program Files (x86)\A3\' + #13#10 +
        '  - C:\Program Files\A3\' + #13#10 +
        '  - D:\A3\' + #13#10 + #13#10 +
        'Instale A3 ERP primero y vuelva a ejecutar este instalador.',
        mbCriticalError, MB_OK);
      Result := False;
      Exit;
    end;
    Log('A3 ERP en: ' + A3BasePath + ' (sin .menu previo, se creara durante la instalacion)');
  end;
end;

// ===================================================================
// InitializeWizard: Crear paginas personalizadas
// ===================================================================
procedure InitializeWizard();
var
  ConfigPath, ConfigContent: String;
  ConfigLines: TArrayOfString;
  i: Integer;
  FrameBevel: TBevel;
begin
  FrameBevel := TBevel.Create(WizardForm);
  FrameBevel.Parent := WizardForm;
  FrameBevel.Shape := bsFrame;
  FrameBevel.SetBounds(0, 0, WizardForm.ClientWidth, WizardForm.ClientHeight);
  FrameBevel.Anchors := [akLeft, akTop, akRight, akBottom];

  // Pagina 1: Empresa + API Key de la Pasarela
  PasarelaPage := CreateInputQueryPage(wpWelcome,
    'SaycuSoft S.L.U.',
    'Instalador de NodeImport',
    'El codigo de empresa se convertira automaticamente a MAYUSCULAS.' + #13#10 +
    'La API Key se obtiene de admin.saycusoft.es > Nodo API > empresa > API Keys.');
  PasarelaPage.Add('Codigo de empresa (ej: TRANSCOLLADO):', False);
  PasarelaPage.Add('API Key:', False);
  PasarelaPage.Surface.Color := $F0EDE8;

  // Pagina 2: Credenciales A3 ERP
  A3CredPage := CreateInputQueryPage(PasarelaPage.ID,
    'SaycuSoft S.L.U.',
    'Credenciales A3 ERP',
    'Introduzca las credenciales que usa para entrar en A3 ERP.');
  A3CredPage.Add('Usuario A3:', False);
  A3CredPage.Add('Contrasena A3:', True);
  A3CredPage.Surface.Color := $F0EDE8;

  // Pagina 3: Configuracion de importacion
  ImportPage := CreateInputQueryPage(A3CredPage.ID,
    'SaycuSoft S.L.U.',
    'Configuracion de importacion',
    'Codigos de cliente y articulo en A3 ERP para la importacion.' + #13#10 +
    'Puede dejar en blanco los articulos si aun no los tiene.');
  ImportPage.Add('Codigo de cliente A3 (CODCLI):', False);
  ImportPage.Add('Codigo articulo Satelles:', False);
  ImportPage.Add('Codigo articulo PCS Valencia:', False);
  ImportPage.Surface.Color := $F0EDE8;

  // Pre-rellenar si existe config.json de instalacion anterior
  ConfigPath := 'C:\Saycusoft\NodeImport\config.json';
  if FileExists(ConfigPath) then
  begin
    if LoadStringsFromFile(ConfigPath, ConfigLines) then
    begin
      ConfigContent := '';
      for i := 0 to GetArrayLength(ConfigLines) - 1 do
        ConfigContent := ConfigContent + ConfigLines[i];
      PasarelaPage.Values[0] := Uppercase(ExtractJsonValue(ConfigContent, 'empresa'));
      PasarelaPage.Values[1] := ExtractJsonValue(ConfigContent, 'apiKey');
      A3CredPage.Values[0] := ExtractJsonValue(ConfigContent, 'usuario');
      A3CredPage.Values[1] := ExtractJsonValue(ConfigContent, 'password');
      ImportPage.Values[0] := ExtractJsonValue(ConfigContent, 'codCliA3');
      ImportPage.Values[1] := ExtractJsonValue(ConfigContent, 'codArtSatelles');
      ImportPage.Values[2] := ExtractJsonValue(ConfigContent, 'codArtPcs');
    end;
  end;
end;

// ===================================================================
// NextButtonClick: Validar al avanzar de pagina
// ===================================================================
function NextButtonClick(CurPageID: Integer): Boolean;
var
  Url, Empresa, ApiKey, ValidationError: String;
begin
  Result := True;

  if CurPageID = PasarelaPage.ID then
  begin
    Url := GetSelectedUrl();
    Empresa := Uppercase(Trim(PasarelaPage.Values[0]));
    ApiKey := Trim(PasarelaPage.Values[1]);

    PasarelaPage.Values[0] := Empresa;

    if Empresa = '' then
    begin
      MsgBox('El codigo de empresa es obligatorio.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if ApiKey = '' then
    begin
      MsgBox('La API Key es obligatoria.' + #13#10 + #13#10 +
             'Puede obtenerla en admin.saycusoft.es > Nodo API > su empresa > API Keys.',
             mbError, MB_OK);
      Result := False;
      Exit;
    end;

    WizardForm.NextButton.Enabled := False;
    try
      ValidationError := ValidatePasarela(Url, Empresa, ApiKey);
    finally
      WizardForm.NextButton.Enabled := True;
    end;

    if ValidationError <> '' then
    begin
      MsgBox('Error de validacion:' + #13#10 + #13#10 + ValidationError, mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  if CurPageID = A3CredPage.ID then
  begin
    if Trim(A3CredPage.Values[0]) = '' then
    begin
      MsgBox('El usuario de A3 ERP es obligatorio.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
    if Trim(A3CredPage.Values[1]) = '' then
    begin
      MsgBox('La contrasena de A3 ERP es obligatoria.', mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;

  if CurPageID = ImportPage.ID then
  begin
    if Trim(ImportPage.Values[0]) = '' then
    begin
      MsgBox('El codigo de cliente A3 es obligatorio.' + #13#10 +
             'Es el CODCLI del proveedor en A3 ERP.',
             mbError, MB_OK);
      Result := False;
      Exit;
    end;
  end;
end;

// ===================================================================
// Post-instalacion: config.json + .menu A3
// ===================================================================
procedure CurStepChanged(CurStep: TSetupStep);
var
  ExePath: String;
begin
  if CurStep = ssPostInstall then
  begin
    WriteConfigJson(ExpandConstant('{app}'));

    ExePath := ExpandConstant('{app}\{#MyAppExeName}');
    if MenuFilePath <> '' then
    begin
      UpdateOrAddMenuEntry(MenuFilePath, ExePath);
      Log('Menu A3 actualizado: ' + MenuFilePath + ' -> ' + ExePath);
    end
    else if A3BasePath <> '' then
    begin
      CreateMenuFiles(ExePath);
      Log('Menu A3 creado en: ' + A3BasePath + ' -> ' + ExePath);
    end;
  end;
end;
