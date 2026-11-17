// Public race-document OCR. Uses the macOS Vision framework when available;
// the collector falls back to the project's bundled Tesseract on other hosts.
import Foundation
import Vision
import ImageIO
import CoreGraphics

struct Line: Codable { let text: String; let confidence: Float; let x: Double; let y: Double; let width: Double; let height: Double }
struct Result: Codable { let width: Int; let height: Int; let engine: String; let lines: [Line]; let text: String }
let paths = Array(CommandLine.arguments.dropFirst())
for path in paths {
    do {
        let url = URL(fileURLWithPath: path)
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw NSError(domain: "image", code: 1) }
        let width = image.width, height = image.height
        var lines: [Line] = []
        var top = 0
        while top < height {
            let tileHeight = min(2200, height - top)
            guard let tile = image.cropping(to: CGRect(x: 0, y: top, width: width, height: tileHeight)) else { break }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["zh-Hans", "en-US"]
            request.usesLanguageCorrection = false
            try VNImageRequestHandler(cgImage: tile, options: [:]).perform([request])
            for observation in request.results ?? [] {
                guard let candidate = observation.topCandidates(1).first else { continue }
                let box = observation.boundingBox
                let localTop = (1 - box.maxY) * Double(tileHeight)
                let localBottom = (1 - box.minY) * Double(tileHeight)
                // Keep only the central portion of overlapping tiles. Partial
                // lines at crop edges otherwise appear twice with different OCR.
                if top > 0 && localTop < 45 { continue }
                if top + tileHeight < height && localBottom > Double(tileHeight - 45) { continue }
                let y = Double(top) + (1 - box.maxY) * Double(tileHeight)
                let x = box.minX * Double(width)
                let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty && !lines.contains(where: { $0.text == text && abs($0.y - y) < 35 }) {
                    lines.append(Line(text: text, confidence: candidate.confidence, x: x, y: y, width: box.width * Double(width), height: box.height * Double(tileHeight)))
                }
            }
            if top + tileHeight == height { break }
            top += tileHeight - 100
        }
        lines.sort { abs($0.y - $1.y) < 8 ? $0.x < $1.x : $0.y < $1.y }
        let result = Result(width: width, height: height, engine: "apple-vision", lines: lines, text: lines.map { $0.text }.joined(separator: "\n"))
        let data = try JSONEncoder().encode(result)
        print(String(data: data, encoding: .utf8)!)
    } catch {
        fputs("OCR failed for \(path): \(error)\n", stderr)
        exit(1)
    }
}
