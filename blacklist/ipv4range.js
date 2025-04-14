class IPv4Range {
    constructor(cidr) {
        const [rangeIp, prefixLength] = cidr.split('/');
        this.network = IPv4Range.stringToNumber(rangeIp);
        this.prefixLength = parseInt(prefixLength, 10);
        this.mask = ~(Math.pow(2, 32 - this.prefixLength) - 1);

        this.start = this.network & this.mask;
        this.end = this.start + Math.pow(2, 32 - this.prefixLength) - 1;
    }

    contains(ipNumber) {
        return ipNumber >= this.start && ipNumber <= this.end;
    }

    static #IPV4_FORMAT = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/;

    static isIPV4(ip) { return IPv4Range.#IPV4_FORMAT.test(ip) }

    static stringToNumber(ip) {
        if (! IPv4Range.isIPV4(ip)) {
            return undefined;
        }
        return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0);
    }

    static #IPV4_LOOPBACK = new IPv4Range("127.0.0.0/8")

    static isLoopback(ip) {
        ip = IPv4Range.stringToNumber(ip)
        return ip && this.#IPV4_LOOPBACK.contains(ip)
    }

    static async parseList(stream) {
        const cidrList = [];

        const parseLine = (line) => {
            if (line.trim() && !line.startsWith('#')) {
                cidrList.push(new IPv4Range(line));
            }
        };

        await processTextStream(stream, parseLine);
        return cidrList
    }

}