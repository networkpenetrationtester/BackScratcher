//************* MISC *************//

import { AxiosRequestConfig, AxiosResponse } from "axios";

export type $Logger = ((message?: any, ...additionalArgs: any[]) => void);

export interface $URLListObject {
    query: string
    wayback_url: string
}

export interface $ResponseHandlerArguments {
    options?: AxiosRequestConfig
    handler?: (res: AxiosResponse) => any
}

//************* WAYBACK API *************//

export type $WaybackAPITimeMap = {
    original: string
    mimetype: string
    timestamp: number
    endtimestamp: number
    groupcount: number
    uniqcount: number
}

export interface $WaybackAPISparkLine {
    years: { [key: string]: number[] }
    first_ts: string
    last_ts: string
    status: {
        [key: string]: string
    }
}

export interface $WaybackAPICalendarCaptureDay {
    items: [number, (string | number), number][]
}

//************* WAYBACK DATABASE INTERFACE *************//

export interface $WaybackDatabaseResource {
    path: string
    data: Buffer
}

export type $WaybackDatabaseProgress = {
    status: number
    downloaded: -1 | 0 | 1
    original: string
}

export type $WaybackDatabaseTimeMap = $WaybackDatabaseProgress & $WaybackAPITimeMap

export interface $WaybackDatabaseProgressDictionary {
    [url: string]: number
}

export interface $WaybackDatabaseInterfaceArguments {
    url?: URL
    verbose?: boolean
    logger?: $Logger
    out_dir?: string
    maintenance?: boolean // avoid generating statements immediately
}