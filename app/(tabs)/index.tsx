import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image as RNImage,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";

const GRID_COLUMNS = 23;
const GRID_ROWS = 14;
const COLUMN_LABELS = Array.from({ length: GRID_COLUMNS }, (_, index) =>
  String.fromCharCode(65 + index),
);
const STORAGE_KEY = "gridclick.settings.v1";
const DEFAULTS = {
  serverMode: "render" as "render" | "local",
  renderUrl: "https://only-faucet.onrender.com",
  localUrl: "http://10.0.2.2:3000",
  nextPath: "/api/next",
  submitPath: "/api/clicks",
};

type Settings = typeof DEFAULTS;
type StatusKind = "idle" | "loading" | "success" | "error";
type ImageSize = { width: number; height: number };
type ImageFrame = { left: number; top: number; width: number; height: number };

type ServerJob = {
  id?: string | number;
  taskId?: string | number;
  imageDataUrl?: string;
  imageUrl?: string;
  dataUrl?: string;
  image?: string | { url?: string; dataUrl?: string; imageDataUrl?: string };
  prompt?: string;
  title?: string;
  [key: string]: unknown;
};

function cellKey(column: number, row: number) {
  return `${column}:${row}`;
}

function parseCellKey(key: string) {
  const [column, row] = key.split(":").map(Number);
  return { column, row };
}

function getColumnLabel(column: number) {
  return COLUMN_LABELS[column] ?? `C${column + 1}`;
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function normalizeImageUri(value: unknown, baseUrl: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const image = value.trim();
  if (image.startsWith("data:") || image.startsWith("https://") || image.startsWith("http://")) {
    return image;
  }
  return `${normalizeBaseUrl(baseUrl)}/${image.replace(/^\/+/, "")}`;
}

function readImageFromJob(body: ServerJob, baseUrl: string) {
  const nested = (body.data as ServerJob | undefined) ?? (body.job as ServerJob | undefined) ?? body;
  const rawImage =
    nested.imageDataUrl ??
    nested.imageUrl ??
    nested.dataUrl ??
    (typeof nested.image === "string"
      ? nested.image
      : nested.image?.dataUrl ?? nested.image?.imageDataUrl ?? nested.image?.url);
  return {
    imageUri: normalizeImageUri(rawImage, baseUrl),
    taskId: nested.id ?? nested.taskId,
    title: nested.title ?? nested.prompt,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function responseMessage(response: Response) {
  const text = await response.text();
  if (!text) return "";
  try {
    const json = JSON.parse(text) as { message?: string; error?: string };
    return json.message ?? json.error ?? text;
  } catch {
    return text;
  }
}

export default function HomeScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [settingsReady, setSettingsReady] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [taskId, setTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ kind: StatusKind; text: string }>({
    kind: "idle",
    text: "Aucune image chargée",
  });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const activeBaseUrl = useMemo(
    () => normalizeBaseUrl(settings.serverMode === "render" ? settings.renderUrl : settings.localUrl),
    [settings.localUrl, settings.renderUrl, settings.serverMode],
  );

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        try {
          setSettings({ ...DEFAULTS, ...(JSON.parse(stored) as Partial<Settings>) });
        } catch {
          // Ignore a corrupted local preference and keep safe defaults.
        }
      })
      .finally(() => setSettingsReady(true));
  }, []);

  const persistSettings = useCallback(async (next: Settings) => {
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const loadImage = useCallback(async () => {
    if (!activeBaseUrl) {
      setStatus({ kind: "error", text: "URL du serveur vide" });
      return;
    }
    setLoading(true);
    setStatus({ kind: "loading", text: "Récupération de l’image…" });
    try {
      const response = await fetchWithTimeout(`${activeBaseUrl}${settings.nextPath.startsWith("/") ? settings.nextPath : `/${settings.nextPath}`}`);
      if (response.status === 204) {
        setImageUri(null);
        setImageSize(null);
        setTaskId(null);
        setTaskTitle(null);
        setSelected(new Set());
        setStatus({ kind: "success", text: "Aucune tâche disponible" });
        return;
      }
      if (!response.ok) {
        throw new Error(`Serveur ${response.status}`);
      }
      const body = (await response.json()) as ServerJob;
      const result = readImageFromJob(body, activeBaseUrl);
      if (!result.imageUri) {
        throw new Error("La réponse ne contient pas d’image");
      }
      setImageUri(result.imageUri);
      setImageSize(null);
      setTaskId(result.taskId == null ? null : String(result.taskId));
      setTaskTitle(result.title == null ? null : String(result.title));
      setSelected(new Set());
      setStatus({ kind: "success", text: "Image prête : sélectionnez au moins 2 cases" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur réseau inconnue";
      setStatus({ kind: "error", text: message.includes("aborted") ? "Délai réseau dépassé" : message });
    } finally {
      setLoading(false);
    }
  }, [activeBaseUrl, settings.nextPath]);

  const refresh = useCallback(async () => {
    if (!activeBaseUrl) return;
    setLoading(true);
    setStatus({ kind: "loading", text: "Vérification du serveur…" });
    try {
      const health = await fetchWithTimeout(`${activeBaseUrl}/api/health`, {}, 10_000);
      if (!health.ok) throw new Error(`Serveur indisponible (${health.status})`);
      await loadImage();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible";
      setLoading(false);
      setStatus({ kind: "error", text: message });
    }
  }, [activeBaseUrl, loadImage]);

  useEffect(() => {
    if (!settingsReady) return;
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh, settingsReady]);

  const imageFrame = useMemo<ImageFrame | null>(() => {
    if (!imageSize || previewSize.width <= 0 || previewSize.height <= 0) return null;
    const scale = Math.min(previewSize.width / imageSize.width, previewSize.height / imageSize.height);
    const width = imageSize.width * scale;
    const height = imageSize.height * scale;
    return {
      width,
      height,
      left: (previewSize.width - width) / 2,
      top: (previewSize.height - height) / 2,
    };
  }, [imageSize, previewSize]);

  const toggleCell = useCallback((column: number, row: number) => {
    const key = cellKey(column, row);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const sendSelection = useCallback(async () => {
    if (selected.size < 2) {
      Alert.alert("Sélection incomplète", "Sélectionnez au moins deux cases avant l’envoi.");
      return;
    }
    setSending(true);
    setStatus({ kind: "loading", text: "Envoi des coordonnées…" });
    const clicks = Array.from(selected)
      .map(parseCellKey)
      .sort((a, b) => a.row - b.row || a.column - b.column)
      .map(({ column, row }) => ({
        column: getColumnLabel(column),
        row: row + 1,
        columnIndex: column + 1,
        rowIndex: row + 1,
        xRatio: (column + 0.5) / GRID_COLUMNS,
        yRatio: (row + 0.5) / GRID_ROWS,
      }));
    const payload = {
      taskId,
      imageUrl: imageUri,
      grid: { columns: GRID_COLUMNS, rows: GRID_ROWS },
      clicks,
      coordinates: clicks,
    };
    try {
      const rawPath = settings.submitPath.replace("{id}", encodeURIComponent(taskId ?? ""));
      const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
      const response = await fetchWithTimeout(`${activeBaseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error((await responseMessage(response)) || `Serveur ${response.status}`);
      }
      setStatus({ kind: "success", text: `${clicks.length} coordonnées envoyées avec succès` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Envoi impossible";
      setStatus({ kind: "error", text: message });
    } finally {
      setSending(false);
    }
  }, [activeBaseUrl, imageUri, selected, settings.submitPath, taskId]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setStatus({ kind: "idle", text: imageUri ? "Sélection effacée" : "Aucune image chargée" });
  }, [imageUri]);

  const frameWidth = Math.max(280, screenWidth - 32);
  const frameHeight = Math.min(500, Math.max(310, frameWidth * 1.16));
  const statusColor = status.kind === "error" ? COLORS.danger : status.kind === "success" ? COLORS.success : COLORS.muted;

  return (
    <ScreenContainer edges={["top", "left", "right"]} safeAreaClassName="bg-background">
      <View style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandMark}>
            <MaterialCommunityIcons name="grid-large" size={22} color={COLORS.accent} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>GRID CLICK</Text>
            <Text style={styles.title}>Sélection 23 × 14</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={() => setShowSettings(true)} accessibilityLabel="Ouvrir les réglages">
            <MaterialCommunityIcons name="tune-variant" size={21} color={COLORS.text} />
          </Pressable>
        </View>

        <View style={styles.sourceRow}>
          <View>
            <Text style={styles.sectionLabel}>SOURCE ACTIVE</Text>
            <Text style={styles.serverText} numberOfLines={1}>{activeBaseUrl || "URL non configurée"}</Text>
          </View>
          <View style={styles.segmented}>
            {(["render", "local"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={async () => {
                  if (settings.serverMode === mode) return;
                  await persistSettings({ ...settings, serverMode: mode });
                }}
                style={[styles.segment, settings.serverMode === mode && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, settings.serverMode === mode && styles.segmentTextActive]}>
                  {mode === "render" ? "Render" : "Local"}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>{status.text}</Text>
          {taskTitle ? <Text style={styles.taskText} numberOfLines={1}>{taskTitle}</Text> : null}
        </View>

        <View
          style={[styles.preview, { width: frameWidth, height: frameHeight }]}
          onLayout={(event) => setPreviewSize(event.nativeEvent.layout)}
        >
          {imageUri ? (
            <>
              <RNImage
                source={{ uri: imageUri }}
                resizeMode="contain"
                style={StyleSheet.absoluteFill}
                onLoad={({ nativeEvent }) => setImageSize({ width: nativeEvent.source.width, height: nativeEvent.source.height })}
                onError={() => setStatus({ kind: "error", text: "Impossible d’afficher l’image reçue" })}
              />
              {imageFrame ? (
                <View pointerEvents="box-only" style={[styles.grid, { left: imageFrame.left, top: imageFrame.top, width: imageFrame.width, height: imageFrame.height }]}>
                  {Array.from({ length: GRID_ROWS }, (_, row) => (
                    <View key={`row-${row}`} style={styles.gridRow}>
                      {Array.from({ length: GRID_COLUMNS }, (_, column) => {
                        const selectedCell = selected.has(cellKey(column, row));
                        return (
                          <Pressable
                            key={cellKey(column, row)}
                            onPress={() => toggleCell(column, row)}
                            style={[styles.cell, selectedCell && styles.cellSelected]}
                            accessibilityLabel={`${getColumnLabel(column)}${row + 1}`}
                          >
                            {selectedCell ? <View style={styles.selectionDot} /> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}><MaterialCommunityIcons name="image-search-outline" size={32} color={COLORS.accent} /></View>
              <Text style={styles.emptyTitle}>Aucune image</Text>
              <Text style={styles.emptyText}>Appuyez sur Actualiser pour récupérer la prochaine tâche.</Text>
            </View>
          )}
          {loading ? <View style={styles.loadingOverlay}><ActivityIndicator size="large" color={COLORS.accent} /><Text style={styles.loadingText}>Connexion…</Text></View> : null}
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} /><Text style={styles.legendText}>Case sélectionnée</Text></View>
          <Text style={styles.counter}>{selected.size} sélectionnée{selected.size > 1 ? "s" : ""}</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={clearSelection} disabled={sending}>
            <MaterialCommunityIcons name="broom" size={18} color={COLORS.text} />
            <Text style={styles.secondaryButtonText}>Effacer</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={refresh} disabled={loading || sending}>
            <MaterialCommunityIcons name="refresh" size={18} color={COLORS.text} />
            <Text style={styles.secondaryButtonText}>Actualiser</Text>
          </Pressable>
          <Pressable style={[styles.sendButton, (selected.size < 2 || sending) && styles.buttonDisabled]} onPress={sendSelection} disabled={selected.size < 2 || sending}>
            {sending ? <ActivityIndicator size="small" color="#07111f" /> : <MaterialCommunityIcons name="send" size={18} color="#07111f" />}
            <Text style={styles.sendButtonText}>Envoyer</Text>
          </Pressable>
        </View>

        <Text style={styles.helperText}>Touchez deux cases ou plus sur l’image, puis envoyez les coordonnées au serveur actif.</Text>
      </View>

      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}><View><Text style={styles.modalEyebrow}>CONFIGURATION</Text><Text style={styles.modalTitle}>Serveurs & API</Text></View><Pressable onPress={() => setShowSettings(false)} style={styles.closeButton}><MaterialCommunityIcons name="close" size={22} color={COLORS.text} /></Pressable></View>
            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>URL Render</Text>
              <TextInput value={settings.renderUrl} onChangeText={(value) => setSettings((current) => ({ ...current, renderUrl: value }))} placeholder="https://mon-service.onrender.com" placeholderTextColor={COLORS.muted} autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <Text style={styles.inputLabel}>URL serveur local</Text>
              <TextInput value={settings.localUrl} onChangeText={(value) => setSettings((current) => ({ ...current, localUrl: value }))} placeholder="http://10.0.2.2:3000" placeholderTextColor={COLORS.muted} autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <Text style={styles.formHint}>Émulateur Android : 10.0.2.2. Téléphone réel : adresse IP locale du Mac mini, par exemple 192.168.1.20.</Text>
              <Text style={styles.inputLabel}>Route pour récupérer une tâche</Text>
              <TextInput value={settings.nextPath} onChangeText={(value) => setSettings((current) => ({ ...current, nextPath: value }))} placeholder="/api/next" placeholderTextColor={COLORS.muted} autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <Text style={styles.inputLabel}>Route pour envoyer les coordonnées</Text>
              <TextInput value={settings.submitPath} onChangeText={(value) => setSettings((current) => ({ ...current, submitPath: value }))} placeholder="/api/clicks ou /api/result/{id}" placeholderTextColor={COLORS.muted} autoCapitalize="none" autoCorrect={false} style={styles.input} />
              <Text style={styles.formHint}>Le placeholder {'{id}'} est remplacé automatiquement par l’identifiant de la tâche.</Text>
              <Pressable style={styles.saveButton} onPress={async () => { await persistSettings(settings); setShowSettings(false); setStatus({ kind: "success", text: "Réglages enregistrés" }); await refresh(); }}><Text style={styles.saveButtonText}>Enregistrer et tester</Text></Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const COLORS = {
  background: "#07111F",
  surface: "#0E1C2E",
  surface2: "#13263D",
  border: "#24405D",
  text: "#F4F8FC",
  muted: "#8FA6BD",
  accent: "#54D2C2",
  accentSoft: "#54D2C233",
  danger: "#FF7E88",
  success: "#6FE3A4",
};

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 16, paddingTop: 14, backgroundColor: COLORS.background },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 18 },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.accent + "66" },
  headerCopy: { flex: 1, marginLeft: 11 },
  eyebrow: { color: COLORS.accent, fontSize: 11, fontWeight: "800", letterSpacing: 2.1 },
  title: { color: COLORS.text, fontSize: 21, fontWeight: "800", marginTop: 2 },
  iconButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.border },
  sourceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 3 },
  serverText: { color: COLORS.text, fontSize: 12, maxWidth: 195 },
  segmented: { flexDirection: "row", padding: 3, borderRadius: 11, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  segment: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  segmentActive: { backgroundColor: COLORS.accent },
  segmentText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  segmentTextActive: { color: "#07111F" },
  statusRow: { flexDirection: "row", alignItems: "center", minHeight: 25, marginBottom: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  statusText: { fontSize: 12, fontWeight: "700", flexShrink: 1 },
  taskText: { color: COLORS.muted, fontSize: 11, marginLeft: 8, flex: 1 },
  preview: { alignSelf: "center", backgroundColor: "#030912", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, position: "relative" },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  emptyIcon: { width: 68, height: 68, borderRadius: 22, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800", marginBottom: 6 },
  emptyText: { color: COLORS.muted, textAlign: "center", lineHeight: 20, fontSize: 13 },
  loadingOverlay: { ...StyleSheet.absoluteFill, backgroundColor: "#07111FBB", alignItems: "center", justifyContent: "center" },
  loadingText: { color: COLORS.text, marginTop: 9, fontWeight: "700" },
  grid: { position: "absolute", flexDirection: "column" },
  gridRow: { flex: 1, flexDirection: "row" },
  cell: { flex: 1, borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: "#FFFFFF80", alignItems: "center", justifyContent: "center" },
  cellSelected: { backgroundColor: "#54D2C299", borderColor: COLORS.accent, borderWidth: 1 },
  selectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#07111F", borderWidth: 1, borderColor: "#E6FFFB" },
  legendRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10, marginBottom: 12 },
  legendItem: { flexDirection: "row", alignItems: "center" },
  legendDot: { width: 9, height: 9, borderRadius: 3, marginRight: 7 },
  legendText: { color: COLORS.muted, fontSize: 11 },
  counter: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 8 },
  secondaryButton: { flex: 1, height: 48, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  secondaryButtonText: { color: COLORS.text, fontSize: 12, fontWeight: "800" },
  sendButton: { flex: 1.22, height: 48, borderRadius: 14, backgroundColor: COLORS.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  sendButtonText: { color: "#07111F", fontSize: 13, fontWeight: "900" },
  buttonDisabled: { opacity: 0.38 },
  helperText: { color: COLORS.muted, fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 11, paddingHorizontal: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "#00000099" },
  modalCard: { maxHeight: "88%", backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, borderTopWidth: 1, borderColor: COLORS.border },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  modalEyebrow: { color: COLORS.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  modalTitle: { color: COLORS.text, fontSize: 23, fontWeight: "800", marginTop: 2 },
  closeButton: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.surface, alignItems: "center", justifyContent: "center" },
  form: { paddingTop: 16, paddingBottom: 30 },
  inputLabel: { color: COLORS.text, fontSize: 12, fontWeight: "800", marginTop: 14, marginBottom: 7 },
  input: { height: 46, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, color: COLORS.text, paddingHorizontal: 13, fontSize: 13 },
  formHint: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 7 },
  saveButton: { height: 50, borderRadius: 14, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center", marginTop: 22 },
  saveButtonText: { color: "#07111F", fontSize: 14, fontWeight: "900" },
});
