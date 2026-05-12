import fs from 'node:fs'
import Database from 'better-sqlite3';
import BetterSQLite3 from 'better-sqlite3';
import type { $WaybackDatabaseProgressObject, $WaybackDatabaseResourceObject, $WaybackDatabaseProgressDictionary, $WaybackDatbaseInterfaceLogger, $WaybackDatbaseInterfaceArguments, $WaybackTimeMapObject } from './index.types.ts';
import { GetWaybackTimemap } from './index.modules.ts';

export class WaybackDatabaseInterface {
    private db!: BetterSQLite3.Database;
    private progress_dictionary!: $WaybackDatabaseProgressDictionary;
    private connected = false;

    private url!: URL;
    private filename!: string;
    private verbose;
    private logger: $WaybackDatbaseInterfaceLogger;

    private GET_PROGRESS_LIST!: BetterSQLite3.Statement<$WaybackDatabaseProgressObject[], $WaybackDatabaseProgressObject>;
    private SET_PROGRESS_ITEM!: BetterSQLite3.Statement<$WaybackDatabaseProgressObject[], never>;

    private GET_RESOURCE_ITEM!: BetterSQLite3.Statement<string, Buffer>;
    private SET_RESOURCE_ITEM!: BetterSQLite3.Statement<$WaybackDatabaseResourceObject[], never>;

    private GET_TIMEMAP_LIST!: BetterSQLite3.Statement<$WaybackTimeMapObject[], $WaybackTimeMapObject>;
    private SET_TIMEMAP_ITEM!: BetterSQLite3.Statement<$WaybackTimeMapObject[], never>;

    constructor(args?: $WaybackDatbaseInterfaceArguments) { // maybe loaded later, so name is optional
        if (args) {
            args.verbose && (this.verbose = args.verbose);
            args.logger && (this.logger = args.logger);
            args.url && (this.url = args.url, this.filename = args.url.host);
        }
        this.verbose ??= false;
        this.logger ??= console.log;
        this.filename && this.Connect();
    }

    Connect(args?: $WaybackDatbaseInterfaceArguments): BetterSQLite3.Database | undefined { // provide facility to switch active file ig
        if (this.connected) this.Disconnect();

        if (args) {
            args.verbose && (this.verbose = args.verbose);
            args.logger && (this.logger = args.logger);
            args.url && (this.url = args.url, this.filename = args.url.host);
        }

        if (!this.filename) {
            this.logger(`URL INVALID/NOT SPECIFIED: ${this.url}`);
            return;
        }

        if (!fs.existsSync('db')) fs.mkdirSync('db');

        let filepath = `./db/${this.filename}.db`;
        let already_exists = fs.existsSync(filepath);

        this.db = new Database(`./db/${this.filename}.db`, this.verbose ? { verbose: this.logger } : {});

        !already_exists && this.logger(`[${this.filename}] DB CREATED`);

        this.connected = true;

        this.logger(`[${this.filename}] DB CONNECTED`);
        this.PrepareStatements();
        this.BuildProgressDictionary();

        !already_exists && this.logger(`[${this.filename}] DB INITIALIZED`);

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
        this.logger(`[${this.filename}] DB DISCONNECTED`);
    }

    private PrepareStatements() {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        // this.db.pragma('journal_mode = WAL');

        this.db.exec("CREATE TABLE IF NOT EXISTS 'resources' ('path' TEXT UNIQUE, 'data' BLOB, PRIMARY KEY('path'))");
        this.db.exec("CREATE TABLE IF NOT EXISTS 'progress' ('path' TEXT UNIQUE, 'failure' NUMERIC, PRIMARY KEY('path'))");
        this.db.exec("CREATE TABLE IF NOT EXISTS 'timemap' ('original' STRING UNIQUE, 'mimetype' STRING, 'timestamp' NUMERIC, 'endtimestamp' NUMERIC, 'groupcount' NUMERIC, 'uniqcount' NUMERIC, PRIMARY KEY('original'))");

        this.GET_PROGRESS_LIST = this.db.prepare('SELECT * FROM progress ORDER BY path ASC');
        this.SET_PROGRESS_ITEM = this.db.prepare('INSERT OR IGNORE INTO progress VALUES (@path, @failure)');

        this.GET_RESOURCE_ITEM = this.db.prepare('SELECT data FROM resources WHERE path IS ?');
        this.SET_RESOURCE_ITEM = this.db.prepare('INSERT OR IGNORE INTO resources VALUES (@path, @data)');

        this.GET_TIMEMAP_LIST = this.db.prepare('SELECT * FROM timemap ORDER BY original ASC');
        this.SET_TIMEMAP_ITEM = this.db.prepare('INSERT OR IGNORE INTO timemap VALUES (@original, @mimetype, @timestamp, @endtimestamp, @groupcount, @uniqcount)');
    }

    private BuildProgressDictionary() {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        this.progress_dictionary = {};

        for (let progress of this.GET_PROGRESS_LIST.all()) {
            this.progress_dictionary[progress.path] = progress.failure;
        }
    }

    GetProgress(path: string) {
        return {
            exists: this.progress_dictionary[path] != null,
            failure: this.progress_dictionary[path]
        }
    }

    SetProgress(progress_obj: $WaybackDatabaseProgressObject) {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        let check = this.GetProgress(progress_obj.path);

        if (!check.exists) {
            this.db.transaction(() => this.SET_PROGRESS_ITEM.run(progress_obj))();
            this.logger(`[${this.filename}] Progress${progress_obj.failure ? ' (fail)' : ''}: ${progress_obj.path}`);
            this.progress_dictionary[progress_obj.path] = progress_obj.failure;
        } else {
            this.logger(`[${this.filename}] Already Progressed${check.failure ? ' (fail)' : ''}: ${progress_obj.path}`);
        }

        return !check.exists && progress_obj.failure === 0;
    }

    GetResource(path: string) {
        if (!this.connected) {
            this.logger(`[${this.filename}] DB NOT CONNECTED`);
            return;
        }

        return this.GET_RESOURCE_ITEM.pluck().get(path);
    }

    SetResource(resource_obj: $WaybackDatabaseResourceObject) { // overhead from SetProgress
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
            this.SetTimeMapList(timemap_list);
        }

        return timemap_list;
    }

    SetTimeMapList(timemap_list: $WaybackTimeMapObject[]) {
        for (let timemap_object of timemap_list) {
            this.db.transaction(() => this.SET_TIMEMAP_ITEM.run(timemap_object))();
        }
    }

    async GetURLList() {
        let timemap = await this.GetTimeMapList();
        let latest_resources = new Map<String, { version: number, wayback_url: string, downloaded?: Boolean }>();

        for (let t of timemap) {
            let wayback_url = `https://web.archive.org/web/${t.timestamp}/${t.original}`;
            let parts = t.original.split('?v=');
            let [url, version] = [parts[0], parseInt(parts[1])];
            if (isNaN(version)) {
                latest_resources.set(url, {
                    version: 0,
                    wayback_url: wayback_url
                });
                continue;
            } else if (version > (latest_resources.get(url)?.version ?? -1)) {
                latest_resources.set(url, {
                    version: version,
                    wayback_url: wayback_url
                });
            }
        }

        return Array.from(latest_resources.values());
    }
}