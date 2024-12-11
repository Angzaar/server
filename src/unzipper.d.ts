declare module "unzipper" {
  import { Stream } from "stream";

  export interface Entry {
    path: string;
    type: "Directory" | "File";
    size: number;
    stream: () => NodeJS.ReadableStream;
    buffer: () => Promise<Buffer>;
  }

  export function Extract(options: { path: string }): Stream;

  export function Parse(): Stream;

  export class Open {
    static file(path: string): Promise<{ files: Entry[] }>;
    static buffer(data: Buffer): Promise<{ files: Entry[] }>;
  }
}
