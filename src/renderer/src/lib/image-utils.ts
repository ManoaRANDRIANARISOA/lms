
/**
 * Helper to generate robust URLs for images in Electron/React environment.
 * Handles:
 * 1. Base64/Data URLs (Immediate preview)
 * 2. Remote URLs (Supabase Storage)
 * 3. Local File Paths (Windows/Linux) via local-resource:// protocol
 */
export function getStudentPhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  // 1. Base64 or Blob (Immediate Preview)
  if (path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }

  // 2. Remote URL (Supabase)
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // 3. Local File Path (Windows/Linux)
  // We need to convert C:\Users\Foo\Bar.jpg -> local-resource:///C:/Users/Foo/Bar.jpg
  // Note the triple slash for protocol + absolute path
  
  // Normalize slashes to forward slashes
  const normalizedPath = path.replace(/\\/g, '/');
  
  // Ensure it doesn't already have the protocol
  if (normalizedPath.startsWith('local-resource:')) {
      return normalizedPath;
  }

  // Prepend protocol
  // If path starts with slash (Linux/Mac), use local-resource://
  // If path starts with Drive Letter (Windows), use local-resource:/// (triple slash acts as root)
  
  if (normalizedPath.startsWith('/')) {
      return `local-resource://${normalizedPath}`;
  } else {
      // Windows path likely (C:/...) -> needs leading slash for URL
      return `local-resource:///${normalizedPath}`;
  }
}
