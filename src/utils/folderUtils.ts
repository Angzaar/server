import fs from "fs";
import path from "path";

export const calculateFolderSize = (folderPath: string): number => {
  if (!fs.existsSync(folderPath)) return 0;

  const files = fs.readdirSync(folderPath);
  return files.reduce((total, file) => {
    const filePath = path.join(folderPath, file);
    const stats = fs.statSync(filePath);
    return total + (stats.isFile() ? stats.size : 0);
  }, 0);
};

export const createFolder = (folderPath: string): void => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
};

export const deleteFolder = (folderPath: string): void => {
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true });
  }
};

export function addDaysToTimestamp(unixTimestamp: number, days: number): number {
  // Calculate the seconds to add (14 days * seconds in a day)
  const secondsInADay = 24 * 60 * 60;
  const addedSeconds = days * secondsInADay;

  // Add the seconds to the original timestamp
  return unixTimestamp + addedSeconds;
}