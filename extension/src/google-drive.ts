export async function deleteFile(fileId: string, token: string) {
  console.log('Dummy deleteFile', fileId);
}

export async function getFileMetadata(fileId: string, token: string) {
  console.log('Dummy getFileMetadata', fileId);
  return { name: 'Recording.webm' };
}

export async function renameFile(fileId: string, token: string, newName: string) {
  console.log('Dummy renameFile', fileId, newName);
}
