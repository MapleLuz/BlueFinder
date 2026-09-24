runtime.requestPermissions(["access_fine_location"]);

importClass(android.content.Context);
importClass(android.location.LocationManager);
importClass(android.location.LocationListener);
importClass(android.location.Criteria);


function wgs84ToGcj02(lng, lat) {
    var a = 6378245.0; // 长半轴
    var ee = 0.00669342162296594323; // 偏心率平方
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLon = transformLon(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    return {
        lng: lng + dLon,
        lat: lat + dLat
    };
}

function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLon(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
}


function getLocation() {
    var lm = context.getSystemService(Context.LOCATION_SERVICE);

    // 检查 GPS 是否开启
    if (!lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        toast("请先开启 GPS 定位");
        // 跳转设置页
        app.startActivity({
            action: "android.settings.LOCATION_SOURCE_SETTINGS"
        });
        return null;
    }

    // 设置高精度定位条件
    var criteria = new Criteria();
    criteria.setAccuracy(Criteria.ACCURACY_FINE);
    var provider = lm.getBestProvider(criteria, true);

    // 先尝试获取最后已知位置
    var location = lm.getLastKnownLocation(provider);
    if (location) {
        var pos = wgs84ToGcj02(location.getLongitude(), location.getLatitude());
        return (pos["lng"] + "," + pos["lat"]);
    }

    // 没有缓存则请求实时更新
    var listener = new LocationListener({
        onLocationChanged: function(loc) {
            if (loc) {
                var pos = wgs84ToGcj02(location.getLongitude(), location.getLatitude());
                return (pos["lng"] + "," + pos["lat"]);

            }
        }
    });
    lm.requestLocationUpdates(provider, 2000, 5, listener);
    return null;
}



const API = "https://newmapi.7mate.cn/api/v1/new/surrounding/car";

/**
 * 解析 '36.1602°N 120.5080°E' 这类字符串
 * 返回 { longitude, latitude }，支持 S / W 为负值，方向大小写均可
 */
function parseCoords(s) {
    const re = /([0-9]+(?:\.[0-9]+)?)\s*°?\s*([NSEWnsew])/g;
    const items = [];
    let m;
    while ((m = re.exec(s)) !== null) {
        items.push([parseFloat(m[1]), m[2].toUpperCase()]);
    }
    if (items.length !== 2) {
        throw new Error("无法解析坐标: " + s);
    }

    const d = {};
    items.forEach(function(it) {
        let v = it[0];
        const hemi = it[1];
        if (hemi === "S" || hemi === "W") v = -v;
        d[hemi] = v;
    });

    const latitude = d.N !== undefined ? d.N : d.S;
    const longitude = d.E !== undefined ? d.E : d.W;
    return {
        longitude: longitude,
        latitude: latitude
    };
}

function getCoords(raw) {
    let coords = raw;
    if (!coords) {
        throw new Error("没有经纬度输入");
    }
    if (coords === null || coords === undefined) {
        exit();
    }
    coords = String(coords).trim();

    if (coords.indexOf(",") >= 0) {
        const arr = coords.split(",").map(function(x) {
            return parseFloat(x.trim());
        });
        return {
            longitude: arr[0],
            latitude: arr[1]
        };
    }
    return parseCoords(coords);
}


/**
 * 用 Java HttpURLConnection 发 GET + JSON body
 * （等价于 Python: requests.get(url, json=data)）
 * 返回 { statusCode, body }
 */
function httpGetWithJson(url, dataObj) {
    const bodyStr = JSON.stringify(dataObj);
    const conn = new java.net.URL(url).openConnection();
    let statusCode = 0;
    let bodyText = "";

    try {
        conn.setRequestMethod("POST");
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        conn.setRequestProperty("X-HTTP-Method-Override", "GET");
        conn.setRequestProperty("Accept", "application/json");
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);

        // 写入 JSON body
        const os = conn.getOutputStream();
        os.write(new java.lang.String(bodyStr).getBytes("UTF-8"));
        os.flush();
        os.close();

        statusCode = conn.getResponseCode();
        const stream = (statusCode >= 200 && statusCode < 300) ?
            conn.getInputStream() :
            conn.getErrorStream();

        if (stream) {
            const reader = new java.io.BufferedReader(
                new java.io.InputStreamReader(stream, "UTF-8")
            );
            let line;
            while ((line = reader.readLine()) !== null) {
                bodyText += line;
            }
            reader.close();
        }
    } finally {
        try {
            conn.disconnect();
        } catch (e) {}
    }

    return {
        statusCode: statusCode,
        body: bodyText
    };
}


function fetchCars(coords) {
    const data = {
        longitude: coords.longitude,
        latitude: coords.latitude,
    };
    const resp = httpGetWithJson(API, data);
    if (resp.statusCode !== 200) {
        throw new Error("HTTP " + resp.statusCode + ": " + resp.body);
    }
    const json = JSON.parse(resp.body);
    return json.data.zhuli.cars;
}


function main(defaultPos) {
    const argStr = dialogs.rawInput("经纬度 (GCJ-02)", defaultPos);

    let coords;
    try {
        coords = getCoords(argStr);
    } catch (e) {
        toast("坐标解析失败: " + e.message);
        return;
    }

    let bikes;
    try {
        bikes = fetchCars(coords);
    } catch (e) {
        toast("请求失败: " + e.message);
        return;
    }

    log("共 " + bikes.length + " 辆");

    bikes.sort(function(a, b) {
        return a.distance / a.electricity - b.distance / b.electricity;
    });

    let bike_str = [];

    bikes.forEach(function(i) {
        bike_str.push(
            String(i.number) + "   " + i.electricity + "%  " + i.distance
        );
    });

    let choice = dialogs.singleChoice("共 " + bikes.length + " 辆", bike_str);
    if (choice != -1) {
        let number = String(bikes[choice].number);
        log(number);
        setClip(number);
    }

}

let pos = null;
while (pos == null) {
    pos = getLocation();
    sleep(300);
}

main(pos);