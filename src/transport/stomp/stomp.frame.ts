export class StompFrameException extends Error {}

const FRAME_BYTE: Record<string, string> = {
  LF: '\x0A',
  NULL: '\x00',
};

export class StompFrame {
  /**
   * Use ack and nack to confirm delivery outside client.
   */
  public ack: (headers?: Record<string, string>) => void = (
    headers: Record<string, string> = {},
  ) => headers;
  public nack: (headers?: Record<string, string>) => void = (
    headers: Record<string, string> = {},
  ) => headers;

  public constructor(
    public command: string,
    public headers: Record<string, string>,
    public body: string,
  ) {}

  private static strip(line: string): string {
    return line.replace(/^\s+|\s+$/g, '');
  }

  public toString(): string {
    /**
     * To prepare message to send use marshall method.
     */
    const lines: string[] = [this.command];

    let content_length_header = false;

    for (const [key, value] of Object.entries(this.headers)) {
      if (key == 'content-length') {
        content_length_header = true;
        continue;
      }

      lines.push(`${key}:${value}`);
    }

    if (!content_length_header) {
      lines.push(`content-length:${this.body.length}`);
    }

    lines.push(FRAME_BYTE['LF'] + this.body);

    return lines.join(FRAME_BYTE['LF']);
  }

  public static unmarshallSingle(data: string): StompFrame {
    /**
     * From response string to STOMP Frame.
     */
    if (data == '\n') {
      throw new StompFrameException('Empty frame');
    }

    const lines: string[] = data.split(FRAME_BYTE['LF']);

    const command = this.strip(lines[0]);

    const headers = {};

    let i = 1;
    while (lines[i] != '') {
      const [key, value] = lines[i].split(':');
      headers[key] = value;
      i += 1;
    }

    const body =
      lines[i + 1] == FRAME_BYTE['NULL'] ? '' : lines[i + 1].slice(0, -1);

    return new StompFrame(command, headers, body);
  }

  public static marshall(
    command: string,
    headers: { [key: string]: string },
    body: string,
  ): string {
    /**
     * Stringify STOMP Frame - prepare to send string via http.
     */
    const frame = new StompFrame(command, headers, body);

    return frame.toString() + FRAME_BYTE['NULL'];
  }
}
