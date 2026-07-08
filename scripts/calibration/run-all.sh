#!/bin/sh
# T1.0a 机判验收: 三断言全过 exit 0;任一非 0 = 标定不成立
# 断言① 以 exportAsync(SCALE 2) 产物 card-2x.png 为对象(get_screenshot 无 2x 能力,已证伪留档 card-mcp.png)
set -e
cd "$(dirname "$0")/../.."
node scripts/calibration/check-scale.mjs docs/calibration-assets/card-2x.png 360 200 2
node scripts/calibration/check-figma-units.mjs docs/calibration-assets/metadata.raw.xml
node scripts/calibration/check-coords.mjs docs/calibration-assets/metadata.raw.xml
echo "T1.0a CALIBRATION OK"
