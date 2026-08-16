/**
 * @file src/utils/skillZipExporter.ts
 * @description Exports Agent Skill packages into a compliant .zip archive conforming to the agentskills.io standard.
 */

import JSZip from 'jszip';
import { AgentSkillPackage } from '../types/agentSkill';

export interface SkillZipExportOptions {
  /** Root directory wrapper name (default: skill.name) */
  folderName?: string;
  /** Whether to place inside a `.skills/` parent directory */
  useDotSkillsPrefix?: boolean;
}

/**
 * Bundles an AgentSkillPackage into an in-memory ZIP Blob.
 */
export async function exportAgentSkillAsZip(
  pkg: AgentSkillPackage,
  options: SkillZipExportOptions = {}
): Promise<Blob> {
  const zip = new JSZip();
  const folderName = options.folderName || pkg.name;
  const basePath = options.useDotSkillsPrefix ? `.skills/${folderName}` : folderName;

  // 1. Root SKILL.md
  zip.file(`${basePath}/SKILL.md`, pkg.rootSkillMd);

  // 2. Reference files (references/*.md)
  for (const ref of pkg.references) {
    zip.file(`${basePath}/${ref.relativePath}`, ref.content);
  }

  // 3. Executable scripts (scripts/*)
  for (const script of pkg.scripts) {
    zip.file(`${basePath}/${script.relativePath}`, script.content);
  }

  // 4. Assets & templates (assets/*)
  for (const asset of pkg.assets) {
    if (asset.mimeType.startsWith('image/') && asset.content && !asset.content.startsWith('<svg')) {
      // Decode base64 image data
      zip.file(`${basePath}/${asset.relativePath}`, asset.content, { base64: true });
    } else {
      zip.file(`${basePath}/${asset.relativePath}`, asset.content);
    }
  }

  // 5. Generate binary zip blob
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/**
 * Triggers a browser download of the exported skill ZIP blob.
 */
export function downloadSkillZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.zip') ? filename : `${filename}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
