import { ipcMain, dialog } from 'electron';
import fs from 'fs';

export function registerDialogHandlers() {
    ipcMain.handle('dialog:openFile', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }
            ]
        });
        
        if (canceled) {
            return null;
        } else {
            const filePath = filePaths[0];
            // Check file size (5MB limit)
            try {
                const stats = fs.statSync(filePath);
                const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
                
                if (stats.size > MAX_SIZE) {
                    dialog.showErrorBox(
                        "Image trop volumineuse", 
                        `L'image sélectionnée fait ${(stats.size / 1024 / 1024).toFixed(2)} MB.\nLa taille maximale autorisée est de 5 MB.`
                    );
                    return null;
                }

                // Read file as Base64 for immediate preview
                const fileBuffer = fs.readFileSync(filePath);
                const base64Image = `data:image/${filePath.split('.').pop()};base64,${fileBuffer.toString('base64')}`;

                return { filePath, preview: base64Image };
            } catch (e) {
                console.error('Error reading file:', e);
                // Fallback to just returning path if read fails
                return { filePath, preview: null }; 
            }
        }
    });
}
