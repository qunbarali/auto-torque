declare module 'better-sqlite3' {
  class Database {
    constructor(filename: string)
    pragma(source: string): unknown
    close(): void
  }

  export default Database
}
