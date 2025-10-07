// src/lib/autoBackup.ts
// Automatic weekly backup functionality

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { exportToCSV } from "@/src/lib/csvExport";
import { getPref, setPref } from "@/src/lib/prefs";

// Type assertion for FileSystem methods (workaround for TS namespace issues)
const FS = FileSystem as any;

// Resolve a writable base directory (documentDirectory preferred; fallback to cacheDirectory).
// On web, both are null – treat auto‑backup as unavailable.
function getBaseDir(): string | null {
  return FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? null;
}

function getBackupDir(): string | null {
  const base = getBaseDir();
  return base ? `${base}backups/` : null;
}
const LAST_BACKUP_KEY = 'last_auto_backup';
const BACKUP_ENABLED_KEY = 'auto_backup_enabled';
const MAX_BACKUPS = 8; // Keep last 8 weeks

/**
 * Check if automatic backup is enabled
 */
export async function isAutoBackupEnabled(): Promise<boolean> {
  const value = await getPref(BACKUP_ENABLED_KEY);
  // Disable on unsupported platforms (e.g., web without FS)
  const fsAvailable = !!getBaseDir() && Platform.OS !== 'web';
  if (!fsAvailable) return false;
  // Default to enabled if not set
  return value === null || value === '1';
}

/**
 * Enable or disable automatic backups
 */
export async function setAutoBackupEnabled(enabled: boolean): Promise<void> {
  // Still persist the preference; the getter will ignore it if FS unavailable
  await setPref(BACKUP_ENABLED_KEY, enabled ? '1' : '0');
}

/**
 * Get the timestamp of the last automatic backup
 */
async function getLastBackupTime(): Promise<number> {
  const value = await getPref(LAST_BACKUP_KEY);
  return value ? Number.parseInt(value, 10) : 0;
}

/**
 * Update the last backup timestamp
 */
async function setLastBackupTime(timestamp: number): Promise<void> {
  await setPref(LAST_BACKUP_KEY, timestamp.toString());
}

/**
 * Check if a backup is due (weekly)
 */
export async function isBackupDue(): Promise<boolean> {
  const enabled = await isAutoBackupEnabled();
  if (!enabled) return false;

  const lastBackup = await getLastBackupTime();
  const now = Date.now();
  const weekInMs = 7 * 24 * 60 * 60 * 1000;

  return (now - lastBackup) >= weekInMs;
}

/**
 * Ensure backup directory exists
 */
async function ensureBackupDir(): Promise<void> {
  const dir = getBackupDir();
  if (!dir) return; // unsupported platform
  const dirInfo = await FS.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FS.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/**
 * Create an automatic backup
 */
export async function createAutoBackup(): Promise<string> {
  // Skip if filesystem unavailable
  const dir = getBackupDir();
  if (!dir) return '';
  await ensureBackupDir();

  const csvContent = await exportToCSV();
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const filename = `sleep-auto-backup-${timestamp}.csv`;
  const filepath = `${dir}${filename}`;

  await FS.writeAsStringAsync(filepath, csvContent, { encoding: FS.EncodingType.UTF8 });
  await setLastBackupTime(Date.now());

  // Clean up old backups
  await cleanupOldBackups();

  return filepath;
}

/**
 * Remove old backups, keeping only the most recent MAX_BACKUPS
 */
async function cleanupOldBackups(): Promise<void> {
  try {
    const dir = getBackupDir();
    if (!dir) return; // unsupported platform
    const files = await FS.readDirectoryAsync(dir);
    const backupFiles = files
      .filter((f: string) => f.startsWith('sleep-auto-backup-') && f.endsWith('.csv'))
      .sort()
      .reverse(); // Newest first

    // Delete files beyond MAX_BACKUPS
    for (let i = MAX_BACKUPS; i < backupFiles.length; i++) {
      await FS.deleteAsync(`${dir}${backupFiles[i]}`, {
        idempotent: true,
      });
    }
  } catch (err) {
    console.error('Error cleaning up old backups:', err);
  }
}

/**
 * Get list of all automatic backups
 */
export async function listAutoBackups(): Promise<{
  filename: string;
  filepath: string;
  size: number;
  modificationTime: number;
}[]> {
  try {
    const dir = getBackupDir();
    if (!dir) return [];
    await ensureBackupDir();
    const files = await FS.readDirectoryAsync(dir);
    const backupFiles = files.filter(
      (f: string) => f.startsWith('sleep-auto-backup-') && f.endsWith('.csv')
    );

    const backups = await Promise.all(
      backupFiles.map(async (filename: string) => {
        const filepath = `${dir}${filename}`;
        const info = await FS.getInfoAsync(filepath);
        return {
          filename,
          filepath,
          size: info.exists && !info.isDirectory ? info.size : 0,
          modificationTime: info.exists && !info.isDirectory ? info.modificationTime : 0,
        };
      })
    );

    return backups.sort((a, b) => b.modificationTime - a.modificationTime);
  } catch (err) {
    console.error('Error listing backups:', err);
    return [];
  }
}

/**
 * Check and create backup if due (call on app startup)
 */
export async function checkAndBackup(): Promise<boolean> {
  try {
    const isDue = await isBackupDue();
    if (isDue) {
      await createAutoBackup();
      return true;
    }
    return false;
  } catch (err) {
    console.error('Auto backup failed:', err);
    return false;
  }
}
