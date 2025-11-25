export class EOF extends Error {}

/**
 * String IO class.
 */
export class StringIO {
  constructor(
    public data: string,
    public pos = 0,
  ) {}

  get avail(): number {
    return this.data.length - this.pos
  }

  peek(n: number): string {
    if (n > this.avail) {
      throw new EOF()
    }
    return this.data.substring(this.pos, this.pos + n)
  }

  read(n: number): string {
    const res = this.peek(n)
    this.pos += n
    return res
  }

  append(data: string) {
    this.data += data
  }
}
