const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'studio/src/pages/StudioPage.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// The file structure:
// Imports
// STUDIO_TABS
// export const StudioPage ...
// const SOPCanvas = ...
// const VideoCanvas = ...
// const DemoCanvas = ...
// async function handleSOPVideoExport() ...

const sopCanvasMatch = content.match(/const SOPCanvas: React\.FC = \(\) => \{[\s\S]*?\n\};\n/);
const videoCanvasMatch = content.match(/const VideoCanvas: React\.FC = \(\) => \{[\s\S]*?\n\};\n/);
const demoCanvasMatch = content.match(/const DemoCanvas: React\.FC = \(\) => \{[\s\S]*?\n\};\n/);
const handleExportMatch = content.match(/\/\*\*[\s\S]*?async function handleSOPVideoExport\(\) \{[\s\S]*?\n\}\n/);

if (!sopCanvasMatch || !videoCanvasMatch || !demoCanvasMatch) {
  console.error("Could not find canvases");
  process.exit(1);
}

const sopCanvasCode = sopCanvasMatch[0];
const videoCanvasCode = videoCanvasMatch[0];
const demoCanvasCode = demoCanvasMatch[0];
const handleExportCode = handleExportMatch ? handleExportMatch[0] : '';

const commonImports = `import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStudioStore } from '../../../store/useStudioStore';
import { I } from '../../../components/icons';
import { cn, Badge, Kbd, AIShimmer, AIButton, DotGrid, ScreenshotPlaceholder, Button } from '../../../components/ui';
import { SummaryCallout, StepCard, ChapterBreak } from '../../../components/studio';
import { RenderConstants } from '../../../modules/render-engine/RenderConstants';
import { CinematicMath } from '../../../modules/render-engine/CinematicMath';
import { BACKEND_URL } from '../../../../shared/constants';
import type { Step, ChapterBreak as IChapterBreak } from '../../../../shared/types/session';
import { WebMFrameExtractor } from '../../../utils/WebMFrameExtractor';
`;

fs.mkdirSync(path.join(__dirname, 'studio/src/components/studio/canvases'), { recursive: true });

// Write SOPCanvas
let sopContent = commonImports + '\nexport ' + sopCanvasCode;
fs.writeFileSync(path.join(__dirname, 'studio/src/components/studio/canvases/SOPCanvas.tsx'), sopContent);

// Write VideoCanvas
let videoContent = commonImports + '\n' + handleExportCode + '\nexport ' + videoCanvasCode;
fs.writeFileSync(path.join(__dirname, 'studio/src/components/studio/canvases/VideoCanvas.tsx'), videoContent);

// Write DemoCanvas
let demoContent = commonImports + '\nexport ' + demoCanvasCode;
fs.writeFileSync(path.join(__dirname, 'studio/src/components/studio/canvases/DemoCanvas.tsx'), demoContent);

// Update StudioPage.tsx
let newContent = content
  .replace(sopCanvasCode, '')
  .replace(videoCanvasCode, '')
  .replace(demoCanvasCode, '')
  .replace(handleExportCode, '');

// Add imports to StudioPage.tsx
newContent = newContent.replace(
  "import { \n  StudioHeader, SidebarControls, SummaryCallout, StepCard, ChapterBreak \n} from '../components/studio';",
  "import { \n  StudioHeader, SidebarControls, SummaryCallout, StepCard, ChapterBreak \n} from '../components/studio';\nimport { SOPCanvas } from '../components/studio/canvases/SOPCanvas';\nimport { VideoCanvas } from '../components/studio/canvases/VideoCanvas';\nimport { DemoCanvas } from '../components/studio/canvases/DemoCanvas';"
);

fs.writeFileSync(filePath, newContent);
console.log("Extraction complete!");
