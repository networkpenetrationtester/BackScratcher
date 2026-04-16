import type { $WaybackSparkLineObject } from './index.types.ts'
const test_data: $WaybackSparkLineObject = {
    "years": {
        "2012": [
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            2,
            0
        ],
        "2016": [
            2,
            0,
            2,
            1,
            2,
            0,
            0,
            0,
            0,
            0,
            0,
            2
        ],
        "2017": [
            0,
            0,
            0,
            0,
            0,
            2,
            0,
            2,
            4,
            6,
            4,
            5
        ],
        "2018": [
            4,
            2,
            4,
            2,
            2,
            0,
            0,
            0,
            0,
            0,
            0,
            0
        ],
        "2021": [
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0
        ],
        "2022": [
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0
        ]
    },
    "first_ts": "20121130043346",
    "last_ts": "20220917190433",
    "status": {
        "2012": "444444444434",
        "2016": "343334444443",
        "2017": "444443433332",
        "2018": "333334444444",
        "2021": "444244444444",
        "2022": "434444442444"
    }
}

function FindBestYear() { }
function FindBestMonth() { }
function Pick2XXCapture() { }

function AnalyzeSparkline(sl: $WaybackSparkLineObject) {
    for (let status of sl.status) {

    }
}