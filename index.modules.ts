import type { $WaybackTimeMapObject, $ResponseHandlerArguments, $WaybackSparkLineObject, $WaybackCalendarCaptureByDay } from './index.types.ts';
import { WaybackDatabaseInterface } from './index.database.ts';

export async function Delay(ms: number) {
    console.log(`Waiting: ${ms}ms...`);
    return await new Promise((resolve) => { setTimeout(resolve, ms) });
}

export const wayback_regex = /(?!(https:\/\/web.archive.org))(?<collection>\/web\/[0-9]{14}\/)(?<resource>.*)/;

export const wayback_fetch_options: RequestInit = {
    headers: {
        'accept': '*/*',
        'cache-control': 'no-cache',
        'pragma': 'no-cache'
    },
    referrer: 'https://web.archive.org/', // without this lie it doesn't work :3
    method: 'GET'
}

export const wayback_fetch_handler = async (res: Response) => {
    let r = await res.text();
    try {
        return JSON.parse(r);
    } catch {
        return r;
    }
}

export async function FetchWrapper(url: string, args: $ResponseHandlerArguments): Promise<any> {
    let res = await fetch(url, args.options ?? {});
    if (res.status !== 200) throw new Error(`${res.status}_${res.statusText.replace(/ /g, '_')}: ${res.url}`);
    return args.handler ? await args.handler(res) : res;
}

export async function GetWaybackHost(url: string) {
    let data = await FetchWrapper(`https://web.archive.org/__wb/search/host?q=${url}`, {
        options: wayback_fetch_options,
        handler: wayback_fetch_handler
    });
    return data;
}

export async function GetWaybackTimemap(url: string, output = 'json', match_type = 'prefix', collapse = 'urlkey', filter_list = 'original,mimetype,timestamp,endtimestamp,groupcount,uniqcount', filter_string = '!statuscode:[45]..', limit = 10000): Promise<$WaybackTimeMapObject[]> {
    let data = await FetchWrapper(`https://web.archive.org/web/timemap/json?url=${url}&matchType=${match_type}&collapse=${collapse}&output=${output}&fl=${filter_list}&filter=${filter_string}&limit=${limit}&_=${Date.now()}`, {
        options: wayback_fetch_options,
        handler: async (res) => {
            let supra: $WaybackTimeMapObject[] = await wayback_fetch_handler(res);
            if (supra instanceof Array) {
                supra = supra.slice(1);
                return supra.map(sup => {
                    let [
                        original,
                        mimetype,
                        timestamp,
                        endtimestamp,
                        groupcount,
                        uniqcount
                    ] = Object.values(sup);
                    return {
                        original: original,
                        mimetype: mimetype,
                        timestamp: timestamp,
                        endtimestamp: endtimestamp,
                        groupcount: groupcount,
                        uniqcount: uniqcount
                    };
                });
            }
            else return supra;
        }
    })
    return data;
}

export async function GetWaybackSparkline(url: string, output = 'json', collection = 'web') {
    let data: $WaybackSparkLineObject = await FetchWrapper(`https://web.archive.org/__wb/sparkline?output=${output}&url=${url}&collection=${collection}`, {
        options: wayback_fetch_options,
        handler: wayback_fetch_handler
    });

    return data;
}

export async function GetWaybackCalendarCapture(url: string, date: string, group_by: 'day' | 'collection' | 'none' = 'none') {
    let data = await FetchWrapper(`https://web.archive.org/__wb/calendarcaptures/2?url=${url}&date=${date}${group_by != 'none' ? '&groupby=' + group_by : ''}`, {
        options: wayback_fetch_options,
        handler: wayback_fetch_handler
    });
    return data;
}

export function TryGetGoodPrefixDate(sparkline: $WaybackSparkLineObject) { // Implement return array of ALL 2xx prefixes?
    let best = {
        year: 'none',
        month: 'none',
        month_captures: 0
    }

    let keys = Object.keys(sparkline.status);

    for (let i = keys.length - 1; i > 0; i--) {
        let year_key = keys[i];
        let monthly_statuses = sparkline.status[year_key];
        let monthly_capture_count = sparkline.years[year_key];
        let month_indicies_2xx = new Array<number>();

        for (let i = 0; i < 12; i++) {
            if (monthly_statuses[i] === '2') month_indicies_2xx.push(i);
        }

        for (let month_key of month_indicies_2xx) {
            let month_capture_count = monthly_capture_count[month_key];
            if (month_capture_count > best.month_captures) { // the reasoning behind this is that the values given to us are only a summary, so we should look for the month containing the most captures as it statistically holds the most 2xxs
                best = {
                    month_captures: month_capture_count,
                    year: year_key,
                    month: (month_key + 1).toString().padStart(2, '0')
                };
            }
        }
    }

    if (best.year === 'none' || best.month === 'none' || best.month_captures === 0) return null;

    return best.year + best.month;
}

export async function TryFindGoodCaptureURL(url: string, date_prefix: string) { // Implement return array of ALL good capture URLs?
    if (date_prefix === 'none') return null;

    let days: $WaybackCalendarCaptureByDay = await GetWaybackCalendarCapture(url, date_prefix, 'day');

    for (let day of days.items) {
        if (day[1] === 200) {
            return `https://web.archive.org/web/${date_prefix}${day[0]}/${url}`;
        }
    }

    return null;
}

export async function RetryFailedRequest(url: string): Promise<Buffer<ArrayBufferLike> | null> { // Implement retries count + 2xx array?
    let sparkline: $WaybackSparkLineObject = await GetWaybackSparkline(url);
    let good_prefix = TryGetGoodPrefixDate(sparkline);

    if (!good_prefix) return null;

    let good_url = await TryFindGoodCaptureURL(url, good_prefix);

    console.log(`[Bulk Downloader] Found Reported 2xx: ${good_url}...`);

    if (good_url) {
        let res = await FetchWrapper(good_url, {
            handler: async (res) => Buffer.from(await res.arrayBuffer())
        });
        if (res instanceof Buffer) return res;
    }

    return null;
}

export async function BulkDownloader(wb_db_int: WaybackDatabaseInterface, interval = 1000, retry = true) {
    let urllist = await wb_db_int.GetURLList();

    for (let url_obj of urllist) {
        let url = url_obj.wayback_url;

        let orig_url = url.match(wayback_regex)?.groups?.resource;
        let parsed_url = URL.parse(orig_url ?? '');

        if (!parsed_url || !orig_url) continue;

        let check = wb_db_int.GetProgress(parsed_url.pathname);

        if (check.exists) {
            console.log(`[Bulk Downloader] Skipping${check.failure ? ' (fail)' : ''}: ${url}`);
            continue;
        }

        console.log(`[Bulk Downloader] Downloading: ${url}...`);

        let res: Buffer | null = null;

        try {
            res = await FetchWrapper(url, {
                handler: async (res) => Buffer.from(await res.arrayBuffer())
            });
        } catch (e) {
            console.error(e);
            console.log(`[Bulk Downloader] Retrying: ${url}...`);
            res = await RetryFailedRequest(orig_url);
        }

        if (res instanceof Buffer) {
            if (wb_db_int.SetProgress({ path: parsed_url.pathname, failure: 0 })) {
                wb_db_int.SetResource({ path: parsed_url.pathname, data: res });
            }
        } else wb_db_int.SetProgress({
            path: parsed_url.pathname,
            failure: 1
        });

        await Delay(interval);
    }
}