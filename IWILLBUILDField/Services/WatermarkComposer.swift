import UIKit
import CoreLocation

enum WatermarkComposer {
    static func bake(image: UIImage, settings: WatermarkSettings, jobName: String, label: String, coordinate: CLLocationCoordinate2D?) -> Data? {
        let lines = settings.lines(jobName: jobName, label: label, coordinate: coordinate)
        guard let cg = image.cgImage else { return image.jpegData(compressionQuality: 0.88) }
        let w = cg.width
        let h = cg.height
        if lines.line1.isEmpty && lines.line2.isEmpty {
            return image.jpegData(compressionQuality: 0.88)
        }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: format)
        let rendered = renderer.image { ctx in
            image.draw(in: CGRect(x: 0, y: 0, width: w, height: h))
            let g = ctx.cgContext
            let ref = settings.orientation == "-90" ? CGFloat(min(w, h)) : CGFloat(w)
            let fontSize = max(16, round(ref * 0.024))
            let lineH = fontSize * 1.35
            let padH = fontSize * 0.55
            let padV = fontSize * 0.45
            let margin = round(ref * 0.022)
            let radius = fontSize * 0.32

            var rows: [String] = []
            if !lines.line1.isEmpty { rows.append(lines.line1) }
            if !lines.line2.isEmpty { rows.append(contentsOf: wrap(lines.line2, width: 60)) }
            let panelH = padV * 2 + CGFloat(rows.count) * lineH - (lineH - fontSize) * 0.5
            let font = UIFont.systemFont(ofSize: fontSize, weight: .bold)
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
            let widths = rows.map { ($0 as NSString).size(withAttributes: attrs).width }
            let maxRow = widths.max() ?? 0

            if settings.orientation == "-90" {
                let maxPanelW = CGFloat(h) - margin * 2
                let panelW = min(maxPanelW, maxRow + padH * 2)
                g.saveGState()
                g.translateBy(x: CGFloat(w), y: CGFloat(h))
                g.rotate(by: -.pi / 2)
                let panelX = margin
                let panelY = -panelH - margin
                drawPanel(g, rect: CGRect(x: panelX, y: panelY, width: panelW, height: panelH), radius: radius)
                drawRows(rows, line1Count: lines.line1.isEmpty ? 0 : 1, origin: CGPoint(x: panelX + padH, y: panelY + padV + fontSize), lineH: lineH, fontSize: fontSize, maxWidth: panelW - padH * 2)
                g.restoreGState()
            } else {
                let maxWidth = CGFloat(w) - margin * 2
                let panelW = min(maxWidth, maxRow + padH * 2)
                let panelX = margin
                let panelY = CGFloat(h) - margin - panelH
                drawPanel(g, rect: CGRect(x: panelX, y: panelY, width: panelW, height: panelH), radius: radius)
                drawRows(rows, line1Count: lines.line1.isEmpty ? 0 : 1, origin: CGPoint(x: panelX + padH, y: panelY + padV + fontSize), lineH: lineH, fontSize: fontSize, maxWidth: panelW - padH * 2)
            }
        }
        return rendered.jpegData(compressionQuality: 0.88)
    }

    private static func drawPanel(_ g: CGContext, rect: CGRect, radius: CGFloat) {
        g.saveGState()
        g.setAlpha(0.65)
        g.setFillColor(UIColor(white: 0.1, alpha: 1).cgColor)
        let path = UIBezierPath(roundedRect: rect, cornerRadius: radius)
        g.addPath(path.cgPath)
        g.fillPath()
        g.restoreGState()
    }

    private static func drawRows(_ rows: [String], line1Count: Int, origin: CGPoint, lineH: CGFloat, fontSize: CGFloat, maxWidth: CGFloat) {
        for (i, row) in rows.enumerated() {
            let isLabel = i >= line1Count
            let font = UIFont.systemFont(ofSize: isLabel ? fontSize * 0.92 : fontSize, weight: isLabel ? .semibold : .bold)
            let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: UIColor.white]
            let y = origin.y + CGFloat(i) * lineH - fontSize
            (row as NSString).draw(with: CGRect(x: origin.x, y: y, width: maxWidth, height: lineH), options: .usesLineFragmentOrigin, attributes: attrs, context: nil)
        }
    }

    private static func wrap(_ text: String, width: Int) -> [String] {
        let capped = String(text.prefix(120))
        if capped.count <= width { return [capped] }
        let idx = capped.index(capped.startIndex, offsetBy: width)
        var split = capped[..<idx]
        if let space = split.lastIndex(of: " ") { split = capped[..<space] }
        let rest = capped[split.endIndex...].trimmingCharacters(in: .whitespaces)
        return [String(split).trimmingCharacters(in: .whitespaces), String(rest.prefix(width))]
    }
}
