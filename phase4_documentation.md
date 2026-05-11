# StudioBase Phase 4: Implementation Documentation

This document outlines the logic and technical changes implemented during Phase 4: **Smart Studio Interactive Player & Editor**.

---

## 1. Core Logic Overview

### A. The Interactive Player (`VideoCanvas`)
The player is built to provide a cinematic, automated experience.
- **Cinematic Animation**: We use `framer-motion` to animate the screenshot container. The `animationTarget` field on each step defines the `centerX`, `centerY`, and `zoomScale`. We calculate the `translateX` and `translateY` values to ensure the specific focus point is always centered in the viewport while zoomed.
- **Audio Synchronization**: An HTML5 `Audio` object is maintained in a `useEffect`. When a step is active, the corresponding `voiceoverKey` is resolved to a URL, loaded, and played. The `ended` event listener automatically triggers the next step in the sequence.
- **Annotation Overlays**: We render an absolute-positioned overlay that maps `Annotation[]` coordinates (in percentages) to visual elements (boxes, arrows, text) using `AnimatePresence` for smooth entry/exit.

### B. Real-time Editor State (`useStudioStore`)
The Zustand store was significantly expanded to handle the player state:
- **`currentStepIndex`**: Tracks the active step in the player.
- **`isPlaying`**: Global toggle for audio and animation progression.
- **`updateStep`**: A critical action that allows updating any field (like `textOverride` or `animationTarget`) for a specific step ID. This ensures changes in the sidebar panels are reflected immediately in the player.

### C. Sidebar Panels Logic
- **Script Panel**: Now features an inline `textarea` that appears when a step is "active" and clicked. It uses `onBlur` to commit changes to the store via `updateStep`.
- **Zooms Panel**: Features a "Focus Point" mini-preview. When clicked, it calculates the click coordinates as a percentage of the preview dimensions and updates the `animationTarget` in real-time.

---

## 2. Technical Diff (Phase 4 vs Phase 3)

The following diff represents all changes made to the `/studio` directory to implement the Smart Studio features.

```diff
diff --git a/studio/src/store/useStudioStore.ts b/studio/src/store/useStudioStore.ts
index 2e503f6..c8bfbd0 100644
--- a/studio/src/store/useStudioStore.ts
+++ b/studio/src/store/useStudioStore.ts
@@ -17,8 +17,15 @@ interface StudioState {
   activeTool: string;
   isToolbarVisible: boolean;
   focusedStepId: string | null;
+  focusedStepIndex: number;
   commandOpen: boolean;
 
+  // Video/Player state
+  isPlaying: boolean;
+  playbackRate: number;
+  currentStepIndex: number;
+  currentTime: number;
+
   // Actions
   navigate: (name: RouteName, params?: Record<string, any>) => void;
   setSession: (session: SessionEnvelope | null) => void;
@@ -29,6 +36,13 @@ interface StudioState {
   toggleToolbar: () => void;
   setFocusStep: (id: string | null) => void;
   setCommandOpen: (open: boolean) => void;
+
+  // Player actions
+  setPlaying: (playing: boolean) => void;
+  setStepIndex: (index: number) => void;
+  setPlaybackRate: (rate: number) => void;
+  setCurrentTime: (time: number) => void;
+  updateStep: (stepId: string, updates: Partial<Step>) => void;
 }
 
 export const useStudioStore = create<StudioState>((set) => ({
@@ -40,15 +54,44 @@ export const useStudioStore = create<StudioState>((set) => ({
   activeTool: 'cursor',
   isToolbarVisible: true,
   focusedStepId: null,
+  focusedStepIndex: 0,
   commandOpen: false,
 
+  isPlaying: false,
+  playbackRate: 1,
+  currentStepIndex: 0,
+  currentTime: 0,
+
   navigate: (name, params = {}) => set({ route: { name, params } }),
-  setSession: (session) => set({ session }),
+  setSession: (session) => {
+    set({ session });
+    if (session && session.steps.length > 0) {
+      set({ focusedStepId: session.steps[0].id, focusedStepIndex: 0 });
+    }
+  },
   setActiveTab: (id) => set({ activeTab: id }),
   togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
   setActiveView: (view) => set({ activeView: view }),
   setActiveTool: (tool) => set({ activeTool: tool }),
   toggleToolbar: () => set((state) => ({ isToolbarVisible: !state.isToolbarVisible })),
-  setFocusStep: (id) => set({ focusedStepId: id }),
+  setFocusStep: (id) => set((state) => {
+    const index = state.session?.steps.findIndex(s => s.id === id) ?? 0;
+    return { focusedStepId: id, focusedStepIndex: Math.max(0, index) };
+  }),
   setCommandOpen: (open) => set({ commandOpen: open }),
+
+  setPlaying: (playing) => set({ isPlaying: playing }),
+  setStepIndex: (index) => set((state) => {
+    const stepId = state.session?.steps[index]?.id || null;
+    return { currentStepIndex: index, focusedStepId: stepId, focusedStepIndex: index };
+  }),
+  setPlaybackRate: (rate) => set({ playbackRate: rate }),
+  setCurrentTime: (time) => set({ currentTime: time }),
+  updateStep: (stepId, updates) => set((state) => {
+    if (!state.session) return state;
+    const newSteps = state.session.steps.map(s => 
+      s.id === stepId ? { ...s, ...updates } : s
+    );
+    return { session: { ...state.session, steps: newSteps } };
+  }),
 }));

diff --git a/studio/src/pages/StudioPage.tsx b/studio/src/pages/StudioPage.tsx
--- a/studio/src/pages/StudioPage.tsx
+++ b/studio/src/pages/StudioPage.tsx
@@ -226,18 +229,190 @@ const SOPCanvas: React.FC = () => {
 };
 
 const VideoCanvas: React.FC = () => {
+  const { 
+    session, 
+    currentStepIndex, 
+    isPlaying, 
+    playbackRate,
+    setPlaying, 
+    setStepIndex 
+  } = useStudioStore();
+
+  const [audio] = useState(new Audio());
+  const [isEnded, setIsEnded] = useState(false);
+
+  const steps = session?.steps || [];
+  const currentStep = steps[currentStepIndex];
+
+  // Handle voiceover playback
+  React.useEffect(() => {
+    if (!currentStep?.voiceoverKey || !isPlaying) {
+      audio.pause();
+      return;
+    }
+
+    const url = `https://assets.studiobase.app/${currentStep.voiceoverKey}`;
+    if (audio.src !== url) {
+      audio.src = url;
+    }
+    
+    audio.playbackRate = playbackRate;
+    audio.play().catch(console.error);
+
+    const handleEnded = () => {
+      if (currentStepIndex < steps.length - 1) {
+        setStepIndex(currentStepIndex + 1);
+      } else {
+        setPlaying(false);
+        setIsEnded(true);
+      }
+    };
+
+    audio.addEventListener('ended', handleEnded);
+    return () => {
+      audio.removeEventListener('ended', handleEnded);
+    };
+  }, [currentStepIndex, isPlaying, playbackRate, steps.length, currentStep?.voiceoverKey]);
+
+  if (!session) return null;
+
+  const target = currentStep?.animationTarget || {
+    centerX: 50,
+    centerY: 50,
+    zoomScale: 1,
+    transitionType: 'zoom',
+    transitionDurationMs: 800
+  };
+
+  // Calculate transform
+  const scale = target.zoomScale;
+  const translateX = (50 - target.centerX) * scale;
+  const translateY = (50 - target.centerY) * scale;
+
   return (
-    <div className="flex-1 studio-gradient flex flex-col items-center justify-center px-10">
-      <div className="relative w-full max-w-4xl aspect-video rounded-img shadow-card-lifted bg-white overflow-hidden">
-        <ScreenshotPlaceholder aspect="16/9" rounded="" className="w-full h-full" />
-        <button className="absolute inset-0 m-auto w-20 h-20 rounded-full glass flex items-center justify-center hover:scale-105 transition">
-          <I.Play size={28} className="text-text translate-x-0.5" />
-        </button>
-      </div>
-      <div className="mt-6 text-center max-w-md">
-        <Badge tone="primary" size="md" icon={I.Lock}>Phase 3</Badge>
-        <h3 className="text-[20px] font-semibold text-text mt-3">Cinematic video preview</h3>
-        <p className="text-[13.5px] text-text-2 mt-1">Auto-zoom, smart cursor, AI voiceover and music will render right here when Phase 3 lands.</p>
+    <div className="flex-1 studio-gradient flex flex-col items-center justify-center p-12 overflow-hidden">
+      <div className="relative w-full max-w-5xl aspect-video rounded-img shadow-card-lifted bg-white overflow-hidden">
+        {/* Animated Screenshot */}
+        <motion.div
+          animate={{
+            scale: scale,
+            x: `${translateX}%`,
+            y: `${translateY}%`,
+          }}
+          transition={{
+            type: target.transitionType === 'zoom' ? 'spring' : 'tween',
+            stiffness: 260,
+            damping: 26,
+            duration: target.transitionDurationMs / 1000
+          }}
+          className="w-full h-full origin-center"
+        >
+          <ScreenshotPlaceholder 
+            step={currentStep} 
+            showChrome={false}
+            aspect="16/9" 
+            rounded="" 
+            className="w-full h-full !shadow-none" 
+          />
+        </motion.div>
+
+        {/* Annotation Overlay */}
+        <div className="absolute inset-0 pointer-events-none">
+          <AnimatePresence>
+            {currentStep?.annotations?.map(anno => (
+              <motion.div
+                key={anno.id}
+                initial={{ opacity: 0, scale: 0.8 }}
+                animate={{ opacity: 1, scale: 1 }}
+                exit={{ opacity: 0, scale: 0.8 }}
+                className="absolute"
+                style={{
+                  left: `${anno.x}%`,
+                  top: `${anno.y}%`,
+                  width: anno.width ? `${anno.width}%` : undefined,
+                  height: anno.height ? `${anno.height}%` : undefined,
+                }}
+              >
+                {anno.shape === 'box' && (
+                  <div className="border-4 border-primary rounded-md w-full h-full shadow-[0_0_20px_rgba(94,92,230,0.4)]" />
+                )}
+                {anno.shape === 'arrow' && (
+                  <div className="relative">
+                    <I.ArrowUpRight size={32} className="text-primary drop-shadow-lg" />
+                    {anno.text && (
+                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-primary text-white text-xs font-bold rounded shadow-lg whitespace-nowrap">
+                        {anno.text}
+                      </div>
+                    )}
+                  </div>
+                )}
+              </motion.div>
+            ))}
+          </AnimatePresence>
+        </div>
+
+        {/* Player Controls Overlay */}
+        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300">
+          <div className="p-6 flex items-center gap-4">
+            <button 
+              onClick={() => setPlaying(!isPlaying)}
+              className="w-12 h-12 rounded-full glass-dark flex items-center justify-center text-white hover:scale-105 transition active:scale-95"
+            >
+              {isPlaying ? <I.Pause size={20} fill="currentColor" /> : <I.Play size={20} fill="currentColor" className="translate-x-0.5" />}
+            </button>
+
+            <div className="flex-1 flex flex-col gap-1.5">
+              <div className="h-1.5 rounded-full bg-white/20 overflow-hidden relative">
+                <motion.div 
+                  className="absolute inset-y-0 left-0 bg-primary"
+                  animate={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
+                />
+              </div>
+              <div className="flex justify-between text-[11px] font-bold text-white/80 tracking-wider">
+                <span>STEP {currentStepIndex + 1} OF {steps.length}</span>
+                <span>{currentStep?.pageTitle || 'Dashboard'}</span>
+              </div>
+            </div>
+          </div>
+        </div>
+      </div>
+    </div>
+  );
+};

diff --git a/studio/src/components/studio/Panels.tsx b/studio/src/components/studio/Panels.tsx
--- a/studio/src/components/studio/Panels.tsx
+++ b/studio/src/components/studio/Panels.tsx
@@ -7,12 +7,9 @@
-  const { session, focusedStepId, setFocusStep } = useStudioStore((state) => ({
-    session: state.session,
-    focusedStepId: state.focusedStepId,
-    setFocusStep: state.setFocusStep
-  }));
+  const { session, focusedStepId, setFocusStep, currentStepIndex, setStepIndex, updateStep } = useStudioStore();
 
@@ -88,18 +93,32 @@
-const ScriptStepRow: React.FC<{ step: Step, active: boolean, onClick: () => void }> = ({ step, active, onClick }) => {
-  const text = step.textOverride || step.generatedText || '';
+const ScriptStepRow: React.FC<{ 
+  step: Step, 
+  active: boolean, 
+  isPlaying: boolean,
+  onClick: () => void,
+  onUpdate: (text: string) => void
+}> = ({ step, active, isPlaying, onClick, onUpdate }) => {
+  const [isEditing, setIsEditing] = useState(false);
+  const [text, setText] = useState(step.textOverride || step.generatedText || '');
```

*(Note: The full diff is available in the documentation for deeper analysis.)*
