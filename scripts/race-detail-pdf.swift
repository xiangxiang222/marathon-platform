// Extract all pages from a public race PDF without adding package dependencies.
// Image-only pages are rasterized for the same OCR pipeline as HTML images.
import Foundation
import PDFKit
import AppKit
struct Page: Codable { let number: Int; let text: String; let image: String? }
struct Result: Codable { let pages: [Page] }
let args = CommandLine.arguments
if args.count != 3 { fputs("usage: race-detail-pdf FILE OUTPUT_DIRECTORY\n",stderr); exit(1) }
guard let document = PDFDocument(url: URL(fileURLWithPath: args[1])) else { fputs("invalid PDF\n",stderr); exit(1) }
try FileManager.default.createDirectory(atPath: args[2], withIntermediateDirectories: true)
var pages: [Page] = []
for number in 0..<document.pageCount {
    guard let page = document.page(at: number) else { continue }
    let text = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    let bounds = page.bounds(for: .mediaBox)
    let scale = min(2, 1800 / bounds.width)
    let image = page.thumbnail(of: NSSize(width: bounds.width * scale, height: bounds.height * scale), for: .mediaBox)
    var output: String? = nil
    if let tiff = image.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
        output = URL(fileURLWithPath: args[2]).appendingPathComponent("page-\(number+1).png").path
        try png.write(to: URL(fileURLWithPath: output!))
    }
    pages.append(Page(number: number + 1, text: text, image: output))
}
let data = try JSONEncoder().encode(Result(pages: pages))
print(String(data: data, encoding: .utf8)!)
