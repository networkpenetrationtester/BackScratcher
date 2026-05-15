import fs from 'node:fs'
import BetterSQLite3 from 'better-sqlite3';
import Database from 'better-sqlite3';
import type { $WaybackDatabaseResource, $WaybackDatabaseProgressDictionary, $Logger, $WaybackDatabaseInterfaceArguments, $WaybackAPITimeMap, $WaybackDatabaseTimeMap, $URLListObject, $WaybackDatabaseProgress } from './index.types.ts';
import { GetWaybackTimemap } from './index.modules.ts';
import path from 'node:path';

export class WaybackDatabaseInterface {
    private db!: BetterSQLite3.Database;
    private progress_dictionary!: $WaybackDatabaseProgressDictionary;
    private connected = false;

    private url!: URL;
    private out_dir!: string;
    private filename!: string;
    private verbose;
    private logger: $Logger;
    private maintenance: boolean;

    private GET_PROGRESS_LIST!: BetterSQLite3.Statement<$WaybackDatabaseProgress[], $WaybackDatabaseProgress>;
    private SET_PROGRESS_ITEM!: BetterSQLite3.Statement<$WaybackDatabaseProgress[], never>;

    private GET_RESOURCE_ITEM!: BetterSQLite3.Statement<string, Buffer>;
    private SET_RESOURCE_ITEM!: BetterSQLite3.Statement<$WaybackDatabaseResource[], never>;

    private GET_TIMEMAP_LIST!: BetterSQLite3.Statement<$WaybackDatabaseTimeMap[], $WaybackDatabaseTimeMap>;
    private SET_TIMEMAP_ITEM!: BetterSQLite3.Statement<$WaybackDatabaseTimeMap[], never>;

    constructor(args?: $WaybackDatabaseInterfaceArguments) { // maybe loaded later, so name is optional
        this.verbose = args?.verbose ?? false;
        this.logger = args?.logger ?? console.log;
        this.out_dir = args?.out_dir ?? '.';
        args?.url && (this.url = args.url, this.filename = args.url.host);
        this.maintenance = args?.maintenance || false;
        this.filename && this.Connect();
    }

    Connect(args?: $WaybackDatabaseInterfaceArguments): BetterSQLite3.Database | undefined { // provide facility to switch active file ig
        if (this.connected) this.Disconnect();

        if (args) {
            this.verbose = args.verbose ?? false;
            this.logger = args.logger ?? console.log;
            this.out_dir = args.out_dir ?? '.';
            args.url && (this.url = args.url, this.filename = args.url.host);
            this.maintenance = args.maintenance || false;
        }

        if (!this.filename) {
            this.logger(`URL INVALID/NOT SPECIFIED: ${this.url}`);
            return;
        }

        !fs.existsSync(this.out_dir) && fs.mkdirSync(this.out_dir, { recursive: true });
        let filepath = path.join(this.out_dir, this.filename + '.db');
        let db_existed = fs.existsSync(filepath);

        this.db = new Database(filepath, this.verbose ? { verbose: this.logger } : {});

        !db_existed && this.logger(`[${this.filename}] DB CREATED`);

        this.connected = true;

        this.logger(`[${this.filename}] DB CONNECTED${this.maintenance ? ' (MAINTENANCE)' : ''}`);
        !this.maintenance && this.PrepareStatements();
        !this.maintenance && this.BuildProgressDictionary();

        !db_existed && this.logger(`[${this.filename}] DB INITIALIZED`);

        return this.db;
    }

    Disconnect() {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        this.db.close();
        this.progress_dictionary = {};
        this.connected = false;
        this.logger(`[${this.filename}] DB DISCONNECTED${this.maintenance ? '(MAINTENANCE)' : ''}`);
    }

    GetDB(): BetterSQLite3.Database | undefined {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        return this.db;
    }

    private PrepareStatements() {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        this.db.pragma(`journal_mode = WAL;`);
        this.db.pragma(`optimize;`)

        this.db.exec(`CREATE TABLE IF NOT EXISTS resources (path TEXT UNIQUE, data BLOB, PRIMARY KEY(path));`);
        this.db.exec(`CREATE TABLE IF NOT EXISTS timemap (original STRING UNIQUE, mimetype STRING, timestamp NUMERIC, endtimestamp NUMERIC, groupcount INTEGER, uniqcount INTEGER, downloaded INTEGER, status INTEGER, PRIMARY KEY(original));`);

        this.GET_PROGRESS_LIST = this.db.prepare(`SELECT original, downloaded, status FROM timemap;`);
        this.SET_PROGRESS_ITEM = this.db.prepare(`UPDATE timemap SET downloaded = @downloaded, status = @status WHERE original IS @original;`);

        this.GET_RESOURCE_ITEM = this.db.prepare(`SELECT data FROM resources WHERE path IS ?;`);
        this.SET_RESOURCE_ITEM = this.db.prepare(`INSERT OR REPLACE INTO resources VALUES (@path, @data);`);

        this.GET_TIMEMAP_LIST = this.db.prepare(`SELECT * FROM timemap ORDER BY groupcount DESC;`); // Order least unique captures first (more likely to contain valid data at top and less likely at bottom)
        this.SET_TIMEMAP_ITEM = this.db.prepare(`INSERT OR REPLACE INTO timemap VALUES (@original, @mimetype, @timestamp, @endtimestamp, @groupcount, @uniqcount, @downloaded, @status);`); // IGNORE/REPLACE
    }

    private BuildProgressDictionary() {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        this.progress_dictionary = {};

        for (let progress of this.GET_PROGRESS_LIST.all()) {
            if (progress.downloaded > -1) this.progress_dictionary[progress.original] = progress.status;
        }
    }

    GetProgressItem(original: string) {
        let status = this.progress_dictionary[original];
        if (status != null) return status;
        return -1;
    }

    SetProgressItem(progress_obj: $WaybackDatabaseProgress) {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        let status = this.GetProgressItem(progress_obj.original);
        let exists = status !== -1;
        let failure = exists && progress_obj.status !== 200;

        if (!exists) {
            this.db.transaction(() => this.SET_PROGRESS_ITEM.run(progress_obj))();
            this.logger(`[${this.filename}] Progress${failure ? ` [fail ${status}]` : ''}: ${progress_obj.original}`);
            this.progress_dictionary[progress_obj.original] = progress_obj.status;
        } else {
            this.logger(`[${this.filename}] Already Progressed ${failure ? `[fail ${status}]` : `[${status}]`}: ${progress_obj.original}`);
        }

        return !exists && !failure;
    }

    GetResourceItem(path: string) {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        return this.GET_RESOURCE_ITEM.pluck().get(path);
    }

    SetResourceItem(resource_obj: $WaybackDatabaseResource) {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        this.logger(`[${this.filename}] Attempting Write: ${resource_obj.path}`);
        this.db.transaction(() => this.SET_RESOURCE_ITEM.run(resource_obj))();
    }

    async GetTimeMapList() {
        let timemap_list = this.GET_TIMEMAP_LIST.all();

        if (timemap_list.length == 0) {
            this.logger(`[${this.filename}] Downloading TimeMap...`);
            timemap_list = await GetWaybackTimemap(this.url.href);
            this.SetTimeMapItem(timemap_list);
        }

        return this.GET_TIMEMAP_LIST.all();
    }

    SetTimeMapItem(timemap_list: $WaybackDatabaseTimeMap[]) {
        for (let timemap_object of timemap_list) {
            this.db.transaction(() => this.SET_TIMEMAP_ITEM.run(timemap_object))();
        }
    }

    async GetURLList(timemap?: $WaybackAPITimeMap[]) {
        timemap ??= await this.GetTimeMapList();
        let urllist = new Map<String, $URLListObject>();

        for (let t of timemap) { // Maybe allow this to be user specified?
            let wayback_url = `https://web.archive.org/web/${t.timestamp}id_/${t.original}`; // FUCK almost shot myself thanks Sally. (What a good boooyyyyyy!!!!!!!)
            let parts = t.original.split('?');
            let [url, query] = parts;
            urllist.set(url, {
                query: query,
                wayback_url: wayback_url
            });
        }

        return Array.from(urllist.values());
    }
}