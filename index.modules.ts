import type { $WaybackAPITimeMap, $ResponseHandlerArguments, $WaybackAPISparkLine, $WaybackAPICalendarCaptureDay, $WaybackDatabaseTimeMap } from './index.types.ts';
import { WaybackDatabaseInterface } from './index.database.ts';
import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export async function Delay(ms: number) {
    console.log(`Waiting: ${ms}ms...`);
    return await new Promise((resolve) => { setTimeout(resolve, ms) });
}

export const wayback_regex = /(?!(https:\/\/web.archive.org))(?<collection>\/web\/[0-9]{14}id_\/)(?<resource>.*)/;

export const wayback_axios_options: AxiosRequestConfig = {
    headers: {
        'accept': '*/*',
        'cache-control': 'no-cache',
        'pragma': 'no-cache'
    },
    responseType: 'arraybuffer',
    fetchOptions: {
        referrer: 'https://web.archive.org/', // without this lie it doesn't work :3
        method: 'GET'
    }
}

export const wayback_fetch_handler = async (res: AxiosResponse) => {
    let r = res.data;
    try {
        return JSON.parse(r);
    } catch {
        return r;
    }
}

export async function FetchWrapper(url: string, args: $ResponseHandlerArguments): Promise<any> {
    return await axios.get(url, args.options ?? {}).then(res => args.handler ? args.handler(res) : res)
        .catch((reason) => {
            switch (reason?.status) {
                case 429: throw new Error('Rate Limited');
                case 500: throw new Error('Interal Server Error');
                case 503: throw new Error('Service Unavailable');
            }
        });
}

export async function GetWaybackHost(url: string) {
    let data = await FetchWrapper(`https://web.archive.org/__wb/search/host?q=${url}`, {
        options: wayback_axios_options,
        handler: wayback_fetch_handler
    });
    return data;
}

export async function GetWaybackTimemap(url: string, output = 'json', match_type = 'prefix', collapse = 'urlkey', filter_list = 'original,mimetype,timestamp,endtimestamp,groupcount,uniqcount', filter_string = '!statuscode:[45]..', limit = 10000): Promise<$WaybackDatabaseTimeMap[]> {
    return await FetchWrapper(`https://web.archive.org/web/timemap/json?url=${url}&matchType=${match_type}&collapse=${collapse}&output=${output}&fl=${filter_list}&filter=${filter_string}&limit=${limit}&_=${Date.now()}`, {
        options: wayback_axios_options,
        handler: async (res) => {
            let supra: $WaybackAPITimeMap[] = await wayback_fetch_handler(res);
            /*
            const fields = supra.splice(0, 1)[0];
            return supra.map(sup => ({
                ...Object.fromEntries(sup.map((val, i) => [fields[i], val])),
                downloaded: -1,
                status: -1
            }));
            */
            return (supra instanceof Array
                ? supra.slice(1).map(sup => {
                    let [
                        original,
                        mimetype,
                        timestamp,
                        endtimestamp,
                        groupcount,
                        uniqcount
                    ] = Object.values(sup);
                    return {
                        original,
                        mimetype,
                        timestamp,
                        endtimestamp,
                        groupcount,
                        uniqcount,
                        downloaded: -1,
                        status: -1
                    };
                })
                : supra
            )
        }
    });
}

export async function GetWaybackSparkline(url: string, output = 'json', collection = 'web') {
    let data: $WaybackAPISparkLine = await FetchWrapper(`https://web.archive.org/__wb/sparkline?output=${output}&url=${url}&collection=${collection}`, {
        options: wayback_axios_options,
        handler: wayback_fetch_handler
    });

    return data;
}

export async function GetWaybackCalendarCapture(url: string, date: string, group_by: 'day' | 'collection' | 'none' = 'none') {
    let data = await FetchWrapper(`https://web.archive.org/__wb/calendarcaptures/2?url=${url}&date=${date}${group_by != 'none' ? '&groupby=' + group_by : ''}`, {
        options: wayback_axios_options,
        handler: wayback_fetch_handler
    });
    return data;
}

export function TryGetGoodPrefixDate(sparkline: $WaybackAPISparkLine) { // Implement return array of ALL 2xx prefixes?
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

    let days: $WaybackAPICalendarCaptureDay = await GetWaybackCalendarCapture(url, date_prefix, 'day');

    for (let day of days.items) {
        if (day[1] === 200) {
            return `https://web.archive.org/web/${date_prefix}${day[0]}/${url}`;
        }
    }

    return null;
}

export async function RetryFailedRequest(url: string) { // Implement retries count + 2xx array?
    let sparkline: $WaybackAPISparkLine = await GetWaybackSparkline(url);
    let good_prefix = TryGetGoodPrefixDate(sparkline);

    if (!good_prefix) return null;

    let good_url = await TryFindGoodCaptureURL(url, good_prefix);

    console.log(`[RetryFailedRequest] Found Reported 2xx: ${good_url}...`);

    let res: { resource: Buffer | null, status: number } | null = await FetchWrapper(url, {
        options: wayback_axios_options,
        handler: res => {
            return {
                status: res.status,
                resource: Buffer.from(res.data)
            }
        }
    }).catch(async (e) => {
        console.error(e);
        console.log(`[RetryFailedRequest] Failed Download: ${url}...`);
    });

    return res;
}

export async function BulkDownloader(wayback_db_interface: WaybackDatabaseInterface, interval = 1000, retry = true) {
    let url_obj_list = await wayback_db_interface.GetURLList();

    for (let url_obj of url_obj_list) {
        let wayback_url = url_obj.wayback_url;

        let original_url = wayback_url.match(wayback_regex)?.groups?.resource;
        let parsed_orig_url = URL.parse(original_url ?? '');

        if (!parsed_orig_url || !original_url) continue;

        let progress_status = wayback_db_interface.GetProgressItem(original_url);
        let progress_exists = progress_status !== -1;
        let progress_failure = progress_exists && progress_status !== 200;

        if (progress_exists) {
            console.log(`[Bulk Downloader] Skipping ${progress_failure ? `[fail ${progress_status}]` : `[done ${progress_status}]`}: ${wayback_url}`);
            continue;
        }

        console.log(`[Bulk Downloader] Downloading: ${wayback_url}...`);

        let res: { resource: Buffer | null, status: number } | null = await FetchWrapper(wayback_url, {
            options: wayback_axios_options,
            handler: res => {
                return {
                    status: res.status,
                    resource: Buffer.from(res.data)
                }
            }
        }).catch(async (e) => {
            console.error(e);
            console.log(`[Bulk Downloader] Retrying: ${wayback_url}...`);
            return await RetryFailedRequest(original_url);
        });

        let { resource, status } = res ?? { resource: null, status: 404 };

        if (resource instanceof Buffer) {
            if (wayback_db_interface.SetProgressItem({ original: original_url, downloaded: 1, status: status })) { // something broke in progress
                wayback_db_interface.SetResourceItem({ path: parsed_orig_url.pathname + parsed_orig_url.search, data: resource });
            }
        } else wayback_db_interface.SetProgressItem({
            original: parsed_orig_url.href,
            status: status,
            downloaded: 0
        });

        await Delay(interval);
    }
}