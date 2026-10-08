import SwiftUI
import UIKit

// Tuval vademde.css tokenları (uygulamadaki theme/colors.ts ile aynı değerler).
extension Color {
    init(light: UInt32, dark: UInt32) {
        self.init(UIColor { trait in
            let hex = trait.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: 1)
        })
    }
}

enum VT {
    static let card = Color(light: 0xFFFFFF, dark: 0x2B2D31)
    static let text = Color(light: 0x1F2126, dark: 0xF6F5F1)
    static let text2 = Color(light: 0x6E6F66, dark: 0xB1B2AA)
    static let brand = Color(light: 0xFFB000, dark: 0xFFB000)
    static let brandText = Color(light: 0x8A5F00, dark: 0xFFB000)
    static let onBrand = Color(light: 0x1F2126, dark: 0x1F2126)
    static let ok = Color(light: 0x14804F, dark: 0x52CE96)
    static let bad = Color(light: 0xD23B35, dark: 0xFF7A75)
    static let violet = Color(light: 0x5A3DF0, dark: 0xA08CFF)
    static let separator = Color(light: 0xE9E9E3, dark: 0x3D3F45)
}

func money(_ text: String, hidden: Bool) -> String { hidden ? "••••" : text }

struct Chip: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(tint)
            .padding(.horizontal, 8)
            .frame(height: 20)
            .background(tint.opacity(0.16))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

struct EmptyState: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "calendar.badge.clock").font(.system(size: 20)).foregroundColor(VT.brand)
            Spacer()
            Text("Vademde’yi açın").font(.system(size: 14, weight: .semibold)).foregroundColor(VT.text)
            Text("Vadeler burada görünecek").font(.system(size: 11)).foregroundColor(VT.text2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

extension View {
    /// Ana ekran kartı: tuvaldeki .wg yüzeyi.
    func homeBackground() -> some View {
        containerBackground(for: .widget) { VT.card }
    }
    func lockBackground() -> some View {
        containerBackground(for: .widget) { Color.clear }
    }
}

extension Snapshot {
    /// Sıradaki vade: en erken tarihli (gecikmişler önce) açık kayıt.
    var next: DueItem? { items.first }
}
