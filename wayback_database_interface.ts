import Database from 'better-sqlite3';
import BetterSQLite3 from 'better-sqlite3';
import type { $WaybackDatabaseProgressObject, $WaybackDatabaseResourceObject, $WaybackDatabaseProgressDictionary } from './index.types.ts';

export type $WaybackDatbaseInterfaceLogger = ((message?: any, ...additionalArgs: any[]) => void);

export interface $WaybackDatbaseInterfaceArguments {
    // filename?: string
    url?: string
    verbose?: boolean
    logger?: $WaybackDatbaseInterfaceLogger
}

export class WaybackDatabaseInterface {
    public db!: BetterSQLite3.Database;
    private connected = false;

    public url!: string;
    public filename!: string;
    private verbose;
    private logger: $WaybackDatbaseInterfaceLogger;

    private GET_PROGRESS_STATEMENT!: BetterSQLite3.Statement<$WaybackDatabaseProgressObject[], $WaybackDatabaseProgressObject>;
    private ADD_PROGRESS_STATEMENT!: BetterSQLite3.Statement<$WaybackDatabaseProgressObject[], never>;
    private GET_RESOURCE_STATEMENT!: BetterSQLite3.Statement<string, Buffer>;
    private ADD_RESOURCE_STATEMENT!: BetterSQLite3.Statement<$WaybackDatabaseResourceObject[], never>;

    private PROGRESS_DICTIONARY!: $WaybackDatabaseProgressDictionary;

    constructor(args?: $WaybackDatbaseInterfaceArguments) { // maybe loaded later, so name is optional
        if (args) {
            args.verbose && (this.verbose = args.verbose);
            args.logger && (this.logger = args.logger);
            args.url && (this.url = args.url);

            let host = URL.parse(args.url ?? '')?.host;
            args.url && host && (this.filename = host);
        }
        this.verbose ??= false;
        this.logger ??= console.log;
    }

    Connect(url?: string): BetterSQLite3.Database | undefined { // provide facility to switch active file ig
        if (url) { // attempting to change files?
            this.url = url;
            this.filename = URL.parse(this.url ?? '')?.host ?? ''; // intentionaly go blank if there's a problem with the URL
        }
        if (!this.filename) {
            this.logger('FILENAME INVALID/NOT SPECIFIED');
            return;
        }
        if (this.connected) this.Disconnect();
        this.db = new Database(`${this.filename}.db`, this.verbose ? { verbose: this.logger } : {});
        this.connected = true;
        this.PrepareStatements(); // execute this every time in case new statements must be built
        this.BuildProgressDictionary();
        return this.db;
    }

    Disconnect() {
        if (!this.connected) {
            this.logger('NOT CONNECTED');
            return;
        }

        this.db.close();
        this.connected = false;
    }

    PrepareStatements() {
        if (!this.connected) {
            this.logger('NOT CONNECTED');
            return;
        }

        this.db.pragma('journal_mode = WAL');
        this.db.exec("CREATE TABLE IF NOT EXISTS 'resources' ('path' TEXT UNIQUE, 'data' BLOB, PRIMARY KEY('path'))");
        this.db.exec("CREATE TABLE IF NOT EXISTS 'progress' ('path' TEXT UNIQUE, 'failure' NUMERIC, PRIMARY KEY('path'))");

        this.GET_PROGRESS_STATEMENT = this.db.prepare('SELECT path, failure FROM progress ORDER BY path ASC');
        this.ADD_PROGRESS_STATEMENT = this.db.prepare('INSERT OR IGNORE INTO progress VALUES (@path, @failure)');
        this.GET_RESOURCE_STATEMENT = this.db.prepare('SELECT data FROM resources WHERE path IS ?');
        this.ADD_RESOURCE_STATEMENT = this.db.prepare('INSERT OR IGNORE INTO resources VALUES (@path, @data)');
    }

    BuildProgressDictionary() {
        if (!this.connected) {
            this.logger('NOT CONNECTED');
            return;
        }

        this.PROGRESS_DICTIONARY = {};
        let progress_list = this.GET_PROGRESS_STATEMENT.all();
        for (let progress of progress_list) {
            this.PROGRESS_DICTIONARY[progress.path] = progress.failure;
        }
        // return this.PROGRESS_DICTIONARY;
    }

    AddOrIgnoreProgress(progress_obj: $WaybackDatabaseProgressObject) { // Checks hrefs to make sure they haven't already been downloaded, if they're new, appends them and returns true, to proceed with downloading the resource. otherwise, skips and returns false.
        if (!this.connected) {
            this.logger('NOT CONNECTED');
            return;
        }

        let exists = this.PROGRESS_DICTIONARY[progress_obj.path];

        if (!exists) {
            this.db.transaction(() => this.ADD_PROGRESS_STATEMENT.run(progress_obj))();
            this.logger(`Progression: ${progress_obj.path} ${progress_obj.failure ? '(fail)' : ''}`);
            this.PROGRESS_DICTIONARY[progress_obj.path] = progress_obj.failure;
        } else {
            this.logger(`Already progressed: ${progress_obj.path} ${progress_obj.failure ? '(fail)' : ''}`);
        }

        return !exists;
    }

    GetResource(url: string) {
        if (!this.connected) {
            this.logger('NOT CONNECTED');
            return;
        };

        let resource = this.GET_RESOURCE_STATEMENT.pluck().get(url);
        return resource;
    }

    AddOrIgnoreResource(resource_obj: $WaybackDatabaseResourceObject) {
        if (!this.connected) {
            this.logger('NOT CONNECTED');
            return;
        };

        this.logger(`Attempting write: ${resource_obj.path}`);
        this.db.transaction(() => this.ADD_RESOURCE_STATEMENT.run(resource_obj))();
    }
}