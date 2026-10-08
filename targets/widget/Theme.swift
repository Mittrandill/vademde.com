import SwiftUI
import UIKit

// Tuval vademde.css koyu tema tokenları (theme/colors.ts koyu değerleri). Widget'lar sistem
// görünümünden bağımsız olarak her zaman koyu çizilir (tuval WidgetAnaEkran, koyu sahne).
extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255)
    }
}

enum VT {
    static let card = Color(hex: 0x2B2D31)
    static let fill = Color(hex: 0xF6F5F1).opacity(0.07)
    static let text = Color(hex: 0xF6F5F1)
    static let text2 = Color(hex: 0xB1B2AA)
    static let brand = Color(hex: 0xFFB000)
    static let brandText = Color(hex: 0xFFB000)
    static let onBrand = Color(hex: 0x1F2126)
    static let ok = Color(hex: 0x52CE96)
    static let bad = Color(hex: 0xFF7A75)
    static let violet = Color(hex: 0xA08CFF)
    static let separator = Color(hex: 0xF6F5F1).opacity(0.08)
}

func money(_ text: String, hidden: Bool) -> String { hidden ? "••••" : text }

/// Tuval .tag: 6 pt köşeli, %14 zeminli küçük etiket.
struct Chip: View {
    let text: String
    let tint: Color
    var body: some View {
        Text(text)
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(tint)
            .padding(.horizontal, 7)
            .frame(height: 20)
            .background(tint.opacity(0.14))
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// Tuval .wl: widget başlık etiketi.
struct WidgetLabel: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 11, weight: .semibold)).foregroundColor(VT.text2).lineLimit(1)
    }
}

/// Banka logosu (bank_<kod> görseli); bulunamazsa yön oku dairesi.
struct ItemMark: View {
    let item: DueItem
    var size: CGFloat = 24
    var body: some View {
        if let bank = item.bank, let image = UIImage(named: "bank_\(bank)") {
            Image(uiImage: image)
                .resizable().scaledToFill()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.25, style: .continuous))
        } else {
            Image(systemName: item.receivable ? "arrow.down.left" : "arrow.up.right")
                .font(.system(size: size * 0.45, weight: .bold))
                .foregroundColor(item.receivable ? VT.ok : VT.violet)
                .frame(width: size, height: size)
                .background(VT.fill)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.25, style: .continuous))
        }
    }
}

/// Uygulama işareti (Yaklaşan vadeler başlığının sağında).
struct AppMark: View {
    var size: CGFloat = 18
    var body: some View {
        if let image = UIImage(named: "vademdeMark") {
            Image(uiImage: image)
                .resizable().scaledToFill()
                .frame(width: size, height: size)
                .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
        }
    }
}

struct EmptyState: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            AppMark(size: 28)
            Spacer()
            Text("Vademde’yi açın").font(.system(size: 14, weight: .semibold)).foregroundColor(VT.text)
            Text("Vadeler burada görünecek").font(.system(size: 11)).foregroundColor(VT.text2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

extension View {
    /// Ana ekran kartı: tuvaldeki .wg yüzeyi (koyu #2B2D31).
    func homeBackground() -> some View {
        environment(\.colorScheme, .dark)
            .containerBackground(for: .widget) { VT.card }
    }
    func lockBackground() -> some View {
        containerBackground(for: .widget) { Color.clear }
    }
}

extension Snapshot {
    /// Sıradaki vade: en erken tarihli (gecikmişler önce) açık kayıt.
    var next: DueItem? { items.first }
}
