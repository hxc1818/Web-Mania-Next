// /public/js/standard-math.js
/**
 * osu!standard 核心数学算法库
 * 包含：2D 几何、Bézier 曲线 (de Casteljau)、三点圆弧 (Circumscribed Circle)、Catmull-Rom 样条及等间距路径采样
 */

class Vec2 {
    constructor(x, y) {
        this.x = x || 0;
        this.y = y || 0;
    }

    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    scale(s) { return new Vec2(this.x * s, this.y * s); }
    dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
    length() { return Math.hypot(this.x, this.y); }
    normalize() {
        const l = this.length();
        return l > 0.00001 ? new Vec2(this.x / l, this.y / l) : new Vec2(0, 0);
    }
    equals(v, eps = 0.001) {
        return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps;
    }
}

class SliderPath {
    /**
     * @param {string} type 'L' | 'P' | 'B' | 'C'
     * @param {Vec2[]} controlPoints
     * @param {number} pixelLength
     */
    constructor(type, controlPoints, pixelLength) {
        this.type = type || 'L';
        this.controlPoints = controlPoints || [];
        this.pixelLength = Math.max(0, pixelLength || 0);
        this.calculatedPath = [];
        this.cumulativeLengths = [0];

        this.calculate();
    }

    calculate() {
        if (!this.controlPoints || this.controlPoints.length === 0) {
            this.calculatedPath = [];
            return;
        }

        let rawPoints = [];
        const pts = this.controlPoints;

        if (this.type === 'P' && pts.length === 3) {
            rawPoints = this.calculateCircumscribedCircle(pts[0], pts[1], pts[2]);
        } else if (this.type === 'B') {
            rawPoints = this.calculateBezier(pts);
        } else if (this.type === 'C') {
            rawPoints = this.calculateCatmull(pts);
        } else {
            // Linear 或退化情况
            rawPoints = this.calculateLinear(pts);
        }

        if (rawPoints.length === 0) rawPoints = pts;

        // 对 rawPoints 进行等间距/截断至 pixelLength 的重采样
        this.resamplePath(rawPoints);
    }

    calculateLinear(pts) {
        const result = [];
        for (let i = 0; i < pts.length; i++) {
            result.push(pts[i]);
        }
        return result;
    }

    calculateCircumscribedCircle(p1, p2, p3) {
        // 计算外接圆圆心和半径
        const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y));
        if (Math.abs(d) < 0.001) {
            // 三点共线退化为折线
            return [p1, p2, p3];
        }

        const p1Sq = p1.x * p1.x + p1.y * p1.y;
        const p2Sq = p2.x * p2.x + p2.y * p2.y;
        const p3Sq = p3.x * p3.x + p3.y * p3.y;

        const cx = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d;
        const cy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d;
        const center = new Vec2(cx, cy);
        const radius = center.dist(p1);

        const a1 = Math.atan2(p1.y - cy, p1.x - cx);
        const a2 = Math.atan2(p2.y - cy, p2.x - cx);
        const a3 = Math.atan2(p3.y - cy, p3.x - cx);

        // 判断顺时针还是逆时针方向
        let da = a3 - a1;
        while (da < 0) da += 2 * Math.PI;
        while (da >= 2 * Math.PI) da -= 2 * Math.PI;

        let a2Rel = a2 - a1;
        while (a2Rel < 0) a2Rel += 2 * Math.PI;
        while (a2Rel >= 2 * Math.PI) a2Rel -= 2 * Math.PI;

        const isClockwise = a2Rel < da;
        let angularDist = this.pixelLength / radius;
        if (!isClockwise) angularDist = -angularDist;

        // 根据曲率采样若干点
        const segments = Math.max(8, Math.min(200, Math.ceil(this.pixelLength / 4)));
        const points = [];
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = a1 + angularDist * t;
            points.push(new Vec2(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)));
        }
        return points;
    }

    calculateBezier(pts) {
        const fullPoints = [];
        let sub = [];

        // osu! 多段贝塞尔分割：两相邻相同点表示前一段截断
        for (let i = 0; i < pts.length; i++) {
            sub.push(pts[i]);
            if (i < pts.length - 1 && pts[i].equals(pts[i + 1])) {
                if (sub.length > 1) {
                    fullPoints.push(...this.subdivideBezier(sub));
                }
                sub = [];
            }
        }
        if (sub.length > 1) {
            fullPoints.push(...this.subdivideBezier(sub));
        }
        return fullPoints.length > 0 ? fullPoints : pts;
    }

    subdivideBezier(pts) {
        // 近似估算步数
        let approxLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            approxLen += pts[i].dist(pts[i + 1]);
        }
        const steps = Math.max(5, Math.ceil(approxLen / 4));
        const result = [];

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            result.push(this.deCasteljau(pts, t));
        }
        return result;
    }

    deCasteljau(points, t) {
        let n = points.length;
        let tmp = points.map(p => new Vec2(p.x, p.y));
        for (let j = 1; j < n; j++) {
            for (let k = 0; k < n - j; k++) {
                tmp[k] = new Vec2(
                    (1 - t) * tmp[k].x + t * tmp[k + 1].x,
                    (1 - t) * tmp[k].y + t * tmp[k + 1].y
                );
            }
        }
        return tmp[0];
    }

    calculateCatmull(pts) {
        if (pts.length < 2) return pts;
        const result = [];
        const n = pts.length;

        for (let i = 0; i < n - 1; i++) {
            const p0 = i > 0 ? pts[i - 1] : pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = i < n - 2 ? pts[i + 2] : p2;

            const segLen = p1.dist(p2);
            const steps = Math.max(5, Math.ceil(segLen / 4));

            for (let s = 0; s <= steps; s++) {
                const t = s / steps;
                const t2 = t * t;
                const t3 = t2 * t;

                const x = 0.5 * ((2 * p1.x) +
                    (-p0.x + p2.x) * t +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

                const y = 0.5 * ((2 * p1.y) +
                    (-p0.y + p2.y) * t +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

                result.push(new Vec2(x, y));
            }
        }
        return result;
    }

    resamplePath(rawPoints) {
        if (!rawPoints || rawPoints.length === 0) return;

        // 计算原始折线累计长度
        const rawLengths = [0];
        let total = 0;
        for (let i = 0; i < rawPoints.length - 1; i++) {
            const d = rawPoints[i].dist(rawPoints[i + 1]);
            total += d;
            rawLengths.push(total);
        }

        const targetLen = this.pixelLength > 0 ? Math.min(this.pixelLength, total) : total;
        const step = 2.5; // 每 2.5 像素采样一个平滑点
        const count = Math.max(2, Math.ceil(targetLen / step));

        this.calculatedPath = [];
        this.cumulativeLengths = [];

        let currentRawIdx = 0;
        for (let i = 0; i < count; i++) {
            const d = (i / (count - 1)) * targetLen;

            while (currentRawIdx < rawLengths.length - 2 && rawLengths[currentRawIdx + 1] < d) {
                currentRawIdx++;
            }

            const d0 = rawLengths[currentRawIdx];
            const d1 = rawLengths[currentRawIdx + 1] || d0;
            const span = d1 - d0;
            const t = span > 0.0001 ? (d - d0) / span : 0;

            const p0 = rawPoints[currentRawIdx];
            const p1 = rawPoints[currentRawIdx + 1] || p0;

            const pt = new Vec2(
                p0.x + (p1.x - p0.x) * t,
                p0.y + (p1.y - p0.y) * t
            );

            this.calculatedPath.push(pt);
            this.cumulativeLengths.push(d);
        }
    }

    /**
     * 根据 0.0 ~ 1.0 的百分比进度返回坐标
     */
    getPositionAtProgress(progress) {
        if (!this.calculatedPath || this.calculatedPath.length === 0) return new Vec2(0, 0);
        const p = Math.max(0, Math.min(1, progress));
        const index = p * (this.calculatedPath.length - 1);
        const base = Math.floor(index);
        const frac = index - base;

        const p0 = this.calculatedPath[base];
        const p1 = this.calculatedPath[Math.min(base + 1, this.calculatedPath.length - 1)];

        return new Vec2(
            p0.x + (p1.x - p0.x) * frac,
            p0.y + (p1.y - p0.y) * frac
        );
    }
}

// 暴露到全局供游戏引擎调用
if (typeof window !== 'undefined') {
    window.Vec2 = Vec2;
    window.SliderPath = SliderPath;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Vec2, SliderPath };
}
