import { ipcMain } from 'electron';
import { SettingsRepository } from '../database/repositories/settings.repository';

export function registerSettingsHandlers() {
  ipcMain.handle('settings:get', (_, key: string) => {
    return SettingsRepository.get(key);
  });

  ipcMain.handle('settings:getAll', (_) => {
    return SettingsRepository.getAll();
  });

  ipcMain.handle('settings:set', (_, key: string, value: any) => {
    return SettingsRepository.set(key, value);
  });
}
