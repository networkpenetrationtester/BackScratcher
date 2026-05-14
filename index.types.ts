/******** MISC ********/

export type $Logger = ((message?: any, ...additionalArgs: any[]) => void);

export interface $URLListObject {
    query: string,
    wayback_url: string
}

export interface $ResponseHandlerArguments {
    options?: RequestInit
    handler?: (res: Response) => any
}

/******** WAYBACK API ********/

export interface $WaybackTimeMapObject {
    original: string
    mimetype: string
    timestamp: number
    endtimestamp: number
    groupcount: number
    uniqcount: number
}

export interface $WaybackSparkLineObject {
    years: { [key: string]: number[] }
    first_ts: string,
    last_ts: string,
    status: {
        [key: string]: string
    }
}

export interface $WaybackCalendarCaptureByDay {
    items: [number, (string | number), number][]
}

/******** WAYBACK DATABASE INTERFACE ********/

export interface $WaybackDatabaseResourceObject {
    path: string,
    data: Buffer
}

export interface $WaybackDatabaseProgressObject {
    path: string,
    failure: number // Implement status code rather than boolean
}

export interface $WaybackDatabaseProgressDictionary {
    [url: string]: number // Implement status code rather than boolean, Implement path rather than entire URL?
}

export interface $WaybackDatbaseInterfaceArguments {
    url?: URL
    verbose?: boolean
    logger?: $Logger
    out_dir?: string
}