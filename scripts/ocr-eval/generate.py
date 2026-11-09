#!/usr/bin/env python3
"""OCR model karşılaştırması için sentetik belgeler üretir (hayali kişi, firma ve banka adları).

Çıktı: output/ocr-eval/docs/ ve output/ocr-eval/expected.json. Aynı tohumla hep aynı belgeler çıkar.
Gerekli: Python 3, Pillow, numpy.
"""
import json
import random
from datetime import date, timedelta
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2] / "output" / "ocr-eval"
DOCS = ROOT / "docs"
FONTS = "/System/Library/Fonts/Supplemental/"
rng = random.Random(42)
np_rng = np.random.default_rng(42)
A4 = (1240, 1754)
FOOTER = "Test örneği - geçersizdir"


def font(size, name="Arial.ttf"):
    return ImageFont.truetype(FONTS + name, size)


def tl(minor):
    whole, cents = divmod(minor, 100)
    return f"{whole:,}".replace(",", ".") + f",{cents:02d}"


def d(day):
    return day.strftime("%d.%m.%Y")


def add_months(day, months):
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    last = (date(year + (month == 12), month % 12 + 1, 1) - timedelta(days=1)).day
    return date(year, month, min(day.day, last))


def words(number):
    ones = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"]
    tens = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan"]

    def group(value):
        hundred = value // 100
        text = "" if hundred == 0 else ("" if hundred == 1 else ones[hundred]) + "Yüz"
        return text + tens[value // 10 % 10] + ones[value % 10]

    million, thousand, rest = number // 1_000_000, number // 1000 % 1000, number % 1000
    text = group(million) + "Milyon" if million else ""
    if thousand:
        text += ("" if thousand == 1 else group(thousand)) + "Bin"
    return text + group(rest)


def page(size=A4):
    image = Image.new("RGB", size, "white")
    return image, ImageDraw.Draw(image)


def text(draw, xy, value, size=26, name="Arial.ttf", fill="#111111", anchor="la"):
    draw.text(xy, value, font=font(size, name), fill=fill, anchor=anchor)


def footer(draw, size=A4):
    text(draw, (size[0] - 30, size[1] - 34), FOOTER, 16, fill="#999999", anchor="ra")


def table(draw, x, y, headers, widths, rows, row_height=34, size=20, right_from=1):
    cursor = x
    draw.rectangle((x, y, x + sum(widths), y + row_height + 6), fill="#E8E8E8")
    for index, (header, width) in enumerate(zip(headers, widths)):
        text(draw, (cursor + 8, y + 8), header, size, "Arial Bold.ttf")
        cursor += width
    y += row_height + 6
    for row in rows:
        cursor = x
        for index, (value, width) in enumerate(zip(row, widths)):
            if index >= right_from:
                text(draw, (cursor + width - 8, y + 6), value, size, anchor="ra")
            else:
                text(draw, (cursor + 8, y + 6), value, size)
            cursor += width
        draw.line((x, y + row_height, x + sum(widths), y + row_height), fill="#CCCCCC")
        y += row_height
    return y


def degrade(image, level):
    """0: temiz tarama, 1: iyi telefon fotoğrafı, 2: zor koşul."""
    if level == 0:
        return image
    angle = rng.uniform(-1.2, 1.2) if level == 1 else rng.uniform(-2.8, 2.8)
    result = image.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=(214, 208, 198))
    result = result.filter(ImageFilter.GaussianBlur(0.6 if level == 1 else 1.2))
    array = np.asarray(result).astype(np.float32)
    height, width = array.shape[:2]
    shade = np.linspace(1.0, 0.82 if level == 1 else 0.62, width)[None, :, None]
    noise = np_rng.normal(0, 4 if level == 1 else 10, array.shape)
    return Image.fromarray(np.clip(array * shade + noise, 0, 255).astype(np.uint8))


DOCUMENTS = []


def save(doc_id, pages, level, expected, group="single", plan=None, statement=None, own=()):
    pages = [degrade(item, level) for item in pages]
    if len(pages) > 1:
        name = f"{doc_id}.pdf"
        pages[0].save(DOCS / name, save_all=True, append_images=pages[1:], resolution=150)
    elif level == 0:
        name = f"{doc_id}.png"
        pages[0].save(DOCS / name)
    else:
        name = f"{doc_id}.jpg"
        pages[0].save(DOCS / name, quality=82)
    DOCUMENTS.append({"id": doc_id, "file": name, "group": group, "level": level, "expected": expected, "plan": plan, "statement": statement, "ownNames": list(own)})


def cheque(doc_id, level, bank, number, drawer, payee, minor, due, issue, place, payee_font="Arial Italic.ttf", direction="receivable", party=None, own=()):
    image, draw = page((1500, 700))
    draw.rectangle((12, 12, 1488, 688), outline="#2F5D7C", width=4)
    text(draw, (50, 40), bank, 40, "Arial Bold.ttf", "#2F5D7C")
    text(draw, (50, 100), f"{place} Şubesi", 24)
    text(draw, (1040, 45), "Çek No:", 24, "Arial Bold.ttf")
    text(draw, (1150, 42), number, 30, "Courier New Bold.ttf")
    text(draw, (1040, 100), f"Keşide: {place}  {d(issue)}", 22)
    text(draw, (50, 180), "Vade Tarihi:", 26, "Arial Bold.ttf")
    text(draw, (230, 178), d(due), 30, "Arial Italic.ttf", "#1B2A8A")
    text(draw, (1040, 170), "Tutar", 22, "Arial Bold.ttf")
    draw.rectangle((1040, 205, 1450, 265), outline="#333333", width=2)
    text(draw, (1060, 217), f"#{tl(minor)} TL#", 32, "Arial Bold.ttf")
    text(draw, (50, 300), f"{payee}", 34, payee_font, "#1B2A8A")
    text(draw, (50, 345), "emrine ödeyiniz.", 24)
    text(draw, (50, 410), f"Yalnız: {words(minor // 100)}TürkLirası", 28, "Arial Italic.ttf", "#1B2A8A")
    text(draw, (50, 520), "Keşideci (Hesap Sahibi):", 22, "Arial Bold.ttf")
    text(draw, (50, 555), drawer, 30)
    text(draw, (1040, 520), "İmza / Kaşe", 22, "Arial Bold.ttf")
    draw.line([(1060, 620), (1130, 565), (1190, 625), (1260, 570), (1370, 610)], fill="#1B2A8A", width=4)
    footer(draw, (1500, 700))
    save(doc_id, [image], level, {"documentType": "cek", "direction": direction, "totalAmount": minor / 100, "dueDate": due.isoformat(), "issueDate": issue.isoformat(), "counterpartyName": party or drawer, "documentNumber": number, "bankName": bank}, own=own)


def promissory(doc_id, level, number, debtor, creditor, minor, due, issue, direction="receivable", party=None, own=()):
    image, draw = page((1500, 860))
    draw.rectangle((12, 12, 1488, 848), outline="#555555", width=3)
    text(draw, (750, 40), "BONO (SENET)", 42, "Arial Bold.ttf", anchor="ma")
    for x, label, value in [(60, "Ödeme Günü", d(due)), (450, "Tutar", f"{tl(minor)} TL"), (860, "Senet No", number), (1170, "Düzenleme", d(issue))]:
        text(draw, (x, 120), label, 22, "Arial Bold.ttf")
        text(draw, (x, 155), value, 30)
    text(draw, (60, 250), f"İşbu bono mukabilinde {d(due)} tarihinde {creditor} emrine", 28)
    text(draw, (60, 300), f"yukarıda yazılı {tl(minor)} Türk Lirasını ({words(minor // 100)}TL) kayıtsız şartsız ödeyeceğim.", 28)
    text(draw, (60, 350), "Bedeli malen ahzolunmuştur.", 28)
    text(draw, (60, 500), "Borçlu (İmzalayan):", 24, "Arial Bold.ttf")
    text(draw, (60, 540), debtor, 32)
    text(draw, (60, 600), "Adres: Çınar Mah. Deneme Sok. No:7 Ankara", 24)
    text(draw, (900, 500), "Alacaklı:", 24, "Arial Bold.ttf")
    text(draw, (900, 540), creditor, 32)
    draw.line([(420, 720), (500, 670), (560, 730), (660, 680)], fill="#1B2A8A", width=4)
    footer(draw, (1500, 860))
    save(doc_id, [image], level, {"documentType": "senet", "direction": direction, "totalAmount": minor / 100, "dueDate": due.isoformat(), "issueDate": issue.isoformat(), "counterpartyName": party or debtor, "documentNumber": number}, own=own)


def invoice(doc_id, level, number, seller, tax_no, buyer, items, issue, due, direction="payable", party=None, own=()):
    image, draw = page()
    text(draw, (70, 70), seller, 38, "Arial Bold.ttf")
    text(draw, (70, 125), f"Vergi No: {tax_no}   Merkez VD", 24)
    text(draw, (800, 70), "e-FATURA", 42, "Arial Bold.ttf", "#2F5D7C")
    for index, (label, value) in enumerate([("Fatura No", number), ("Fatura Tarihi", d(issue)), ("Son Ödeme Tarihi", d(due))]):
        text(draw, (760, 150 + index * 38), f"{label}:", 24, "Arial Bold.ttf")
        text(draw, (990, 150 + index * 38), value, 24)
    text(draw, (70, 240), "SAYIN", 24, "Arial Bold.ttf")
    text(draw, (70, 275), buyer, 30)
    rows, subtotal = [], 0
    for name, quantity, unit in items:
        line = quantity * unit
        subtotal += line
        rows.append([name, str(quantity), tl(unit), "%20", tl(line)])
    bottom = table(draw, 70, 400, ["Açıklama", "Miktar", "Birim Fiyat", "KDV", "Tutar"], [480, 110, 190, 90, 230], rows, 44, 24)
    vat = subtotal * 20 // 100
    total = subtotal + vat
    for index, (label, value) in enumerate([("Ara Toplam", subtotal), ("KDV (%20)", vat), ("GENEL TOPLAM", total)]):
        text(draw, (760, bottom + 50 + index * 46), label, 26, "Arial Bold.ttf")
        text(draw, (1170, bottom + 50 + index * 46), f"{tl(value)} TL", 26, "Arial Bold.ttf", anchor="ra")
    footer(draw)
    save(doc_id, [image], level, {"documentType": "fatura", "direction": direction, "totalAmount": total / 100, "dueDate": due.isoformat(), "issueDate": issue.isoformat(), "counterpartyName": party or seller, "documentNumber": number}, own=own)


def utility(doc_id, level, company, subscriber, minor, issue, due):
    image, draw = page()
    text(draw, (70, 70), company, 38, "Arial Bold.ttf", "#B5541C")
    text(draw, (70, 130), "ELEKTRİK FATURASI", 32, "Arial Bold.ttf")
    rows = [("Abone Adı", subscriber), ("Tesisat No", "4471203986"), ("Fatura Dönemi", "Ekim 2026"), ("Düzenleme Tarihi", d(issue)), ("Son Ödeme Tarihi", d(due)), ("Tüketim", "386 kWh"), ("Önceki Borç", "0,00 TL")]
    for index, (label, value) in enumerate(rows):
        text(draw, (70, 230 + index * 52), f"{label}:", 28, "Arial Bold.ttf")
        text(draw, (430, 230 + index * 52), value, 28)
    draw.rectangle((70, 640, 1170, 750), fill="#F5E9DF")
    text(draw, (100, 672), "ÖDENECEK TUTAR", 34, "Arial Bold.ttf")
    text(draw, (1140, 672), f"{tl(minor)} TL", 40, "Arial Bold.ttf", anchor="ra")
    footer(draw)
    save(doc_id, [image], level, {"documentType": "abonelik|fatura", "direction": "payable", "totalAmount": minor / 100, "dueDate": due.isoformat(), "counterpartyName": company})


def receipt_transfer(doc_id, level, bank, sender, recipient, minor, when, reference, kind, fee, direction="expense", party=None, own=()):
    image, draw = page((1240, 1100))
    text(draw, (70, 60), bank, 38, "Arial Bold.ttf", "#2F5D7C")
    text(draw, (70, 120), f"{kind} DEKONTU", 32, "Arial Bold.ttf")
    rows = [("İşlem Tarihi", when.strftime("%d.%m.%Y 14:32")), ("Referans No", reference), ("Gönderen", sender), ("Gönderen IBAN", "TR12 0009 9000 1234 5678 9012 34"), ("Alıcı", recipient), ("Alıcı IBAN", "TR55 0008 8000 9876 5432 1098 76"), ("Açıklama", "Kasım ayı mal bedeli"), ("Tutar", f"{tl(minor)} TL"), ("İşlem Masrafı", f"{tl(fee)} TL")]
    for index, (label, value) in enumerate(rows):
        text(draw, (70, 220 + index * 70), f"{label}:", 28, "Arial Bold.ttf")
        text(draw, (400, 220 + index * 70), value, 28)
    footer(draw, (1240, 1100))
    save(doc_id, [image], level, {"documentType": "banka_dekontu", "direction": direction, "totalAmount": minor / 100, "issueDate": when.isoformat(), "counterpartyName": party or recipient, "documentNumber": reference}, own=own)


def slip(doc_id, level, shop, tax_no, items, when, number, method):
    height = 760 + 56 * len(items)
    image, draw = page((720, height))
    name = "Courier New.ttf"
    bold = "Courier New Bold.ttf"
    text(draw, (360, 40), shop, 40, bold, anchor="ma")
    text(draw, (360, 95), "Merkez Mah. Örnek Cad. No:12", 24, name, anchor="ma")
    text(draw, (360, 130), f"VKN: {tax_no}", 24, name, anchor="ma")
    text(draw, (40, 200), f"TARİH: {d(when)}", 26, name)
    text(draw, (40, 240), "SAAT : 18:47", 26, name)
    text(draw, (40, 280), f"FİŞ NO: {number}", 26, name)
    y, total = 350, 0
    for label, minor in items:
        total += minor
        text(draw, (40, y), label, 26, name)
        text(draw, (680, y), f"*{tl(minor)}", 26, name, anchor="ra")
        y += 56
    draw.line((40, y, 680, y), fill="#222222", width=2)
    text(draw, (40, y + 30), "TOPLAM", 34, bold)
    text(draw, (680, y + 30), f"*{tl(total)}", 34, bold, anchor="ra")
    text(draw, (40, y + 95), "TOPKDV", 26, name)
    text(draw, (680, y + 95), f"*{tl(total * 20 // 120)}", 26, name, anchor="ra")
    text(draw, (40, y + 145), method, 28, bold)
    text(draw, (680, y + 145), f"*{tl(total)}", 28, bold, anchor="ra")
    footer(draw, (720, height))
    save(doc_id, [image], level, {"documentType": "makbuz_fis", "direction": "expense", "totalAmount": total / 100, "issueDate": when.isoformat(), "counterpartyName": shop})


def loan(doc_id, level, bank, principal, annual_rate, count, first_due, issue, per_page=30):
    monthly = annual_rate / 12 / 100
    payment = round(principal * monthly / (1 - (1 + monthly) ** -count))
    remaining, rows, plan = principal, [], []
    for number in range(1, count + 1):
        interest = round(remaining * monthly)
        amount = payment if number < count else remaining + interest + round(interest * 0.15)
        tax = round(interest * 0.15)
        capital = amount - interest - tax
        if number == count:
            capital = remaining
            amount = capital + interest + tax
        remaining -= capital
        due = add_months(first_due, number - 1)
        rows.append([str(number), d(due), tl(capital), tl(interest), tl(tax), tl(amount), tl(remaining)])
        plan.append({"n": number, "dueDate": due.isoformat(), "principal": capital / 100, "interest": interest / 100, "tax": tax / 100, "amount": amount / 100, "remaining": remaining / 100})
    total = sum(item["amount"] for item in plan)
    pages = []
    for start in range(0, count, per_page):
        image, draw = page()
        if start == 0:
            text(draw, (70, 60), bank, 36, "Arial Bold.ttf", "#2F5D7C")
            text(draw, (70, 115), "KREDİ ÖDEME PLANI", 30, "Arial Bold.ttf")
            info = [("Kredi Türü", "İhtiyaç Kredisi"), ("Kredi Tutarı", f"{tl(principal)} TL"), ("Aylık Faiz", f"%{annual_rate / 12:.2f}"), ("Taksit Sayısı", str(count)), ("Toplam Geri Ödeme", f"{tl(round(total * 100))} TL"), ("Kullandırım Tarihi", d(issue))]
            for index, (label, value) in enumerate(info):
                text(draw, (70, 170 + index * 34), f"{label}:", 22, "Arial Bold.ttf")
                text(draw, (330, 170 + index * 34), value, 22)
            top = 400
        else:
            text(draw, (70, 60), f"{bank} - Ödeme Planı (devam)", 26, "Arial Bold.ttf")
            top = 120
        table(draw, 50, top, ["No", "Vade", "Anapara", "Faiz", "BSMV", "Taksit", "Kalan Anapara"], [60, 165, 190, 160, 140, 190, 235], rows[start:start + per_page], 40, 21)
        footer(draw)
        pages.append(image)
    save(doc_id, pages, level, {"documentType": "kredi", "direction": "payable", "totalAmount": principal / 100, "counterpartyName": bank}, "table", plan={"count": count, "totalRepayment": round(total, 2), "rows": plan})


MERCHANTS = [("MIGROS TICARET", "purchase"), ("SHELL OTOMAT", "purchase"), ("A101 YENI MAGAZA", "purchase"), ("STARBUCKS KADIKOY", "purchase"), ("TRENDYOL", "purchase"), ("HEPSIBURADA", "purchase"), ("NETFLIX.COM", "purchase"), ("OPET PETROL", "purchase"), ("ECZANE SIFA", "purchase"), ("TURKCELL FATURA", "purchase"), ("BIM BIRLESIK", "purchase"), ("IADE - TRENDYOL", "refund"), ("KART AIDATI", "fee"), ("AKDI FAIZ", "interest"), ("NAKIT AVANS ATM", "cash_advance")]


def statement(doc_id, level, bank, count, statement_day, due, per_page=26):
    day, rows, items, balance = statement_day - timedelta(days=30), [], [], 0
    previous = rng.randint(800_000, 2_400_000)
    rows.append([d(day), "ÖDEME - TEŞEKKÜRLER", f"-{tl(previous)}"])
    items.append({"date": day.isoformat(), "amount": previous / 100, "type": "payment"})
    for index in range(count - 1):
        day = day + timedelta(days=rng.randint(0, 2)) if day < statement_day - timedelta(days=2) else day
        name, kind = MERCHANTS[rng.randrange(len(MERCHANTS))] if index % 5 else MERCHANTS[rng.randrange(11)]
        minor = rng.randint(4_500, 950_000)
        credit = kind == "refund"
        balance += -minor if credit else minor
        rows.append([d(day), name, f"{'-' if credit else ''}{tl(minor)}"])
        items.append({"date": day.isoformat(), "amount": minor / 100, "type": kind})
    minimum = balance * 40 // 100
    pages = []
    for start in range(0, len(rows), per_page):
        image, draw = page()
        if start == 0:
            text(draw, (70, 60), bank, 36, "Arial Bold.ttf", "#2F5D7C")
            text(draw, (70, 115), "KREDİ KARTI HESAP ÖZETİ", 30, "Arial Bold.ttf")
            info = [("Kart No", "5401 **** **** 7742"), ("Hesap Kesim Tarihi", d(statement_day)), ("Son Ödeme Tarihi", d(due)), ("Önceki Dönem Borcu", f"{tl(previous)} TL"), ("Dönem Borcu", f"{tl(balance)} TL"), ("Asgari Ödeme Tutarı", f"{tl(minimum)} TL")]
            for index, (label, value) in enumerate(info):
                text(draw, (70, 175 + index * 36), f"{label}:", 23, "Arial Bold.ttf")
                text(draw, (360, 175 + index * 36), value, 23)
            top = 420
        else:
            text(draw, (70, 60), f"{bank} - Hesap Özeti (devam)", 26, "Arial Bold.ttf")
            top = 120
        table(draw, 70, top, ["Tarih", "Açıklama", "Tutar (TL)"], [200, 660, 240], rows[start:start + per_page], 42, 23, right_from=2)
        footer(draw)
        pages.append(image)
    save(doc_id, pages, level, {"documentType": "kredi_karti_ekstresi", "totalAmount": balance / 100, "dueDate": due.isoformat(), "counterpartyName": bank}, "table", statement={"last4": "7742", "statementDate": statement_day.isoformat(), "minimumPayment": minimum / 100, "previousDebt": previous / 100, "rows": items})


def main():
    DOCS.mkdir(parents=True, exist_ok=True)
    for old in DOCS.iterdir():
        old.unlink()
    cheque("o01", 0, "Anadolu Ticaret Bankası A.Ş.", "0123456", "Delta Hırdavat Ltd. Şti.", "Mavi Lojistik A.Ş.", 18_500_000, date(2026, 12, 15), date(2026, 11, 2), "Kadıköy")
    cheque("o02", 1, "Marmara Katılım Bankası A.Ş.", "7741209", "Kaya İnşaat San. Tic.", "Güneş Gıda Ltd.", 200_000_000, date(2027, 1, 20), date(2026, 10, 25), "Bursa")
    cheque("o03", 2, "Ege Kalkınma Bankası A.Ş.", "0045512", "Aslan Tekstil A.Ş.", "Mert Yılmaz", 7_425_050, date(2027, 2, 28), date(2026, 11, 5), "İzmir")
    promissory("o04", 0, "S-2026-118", "Burak Çelik", "Ayla Şahin", 4_000_000, date(2027, 3, 1), date(2026, 11, 1))
    promissory("o05", 2, "S-2026-247", "Deniz Öztürk", "Yeşil Oto Ltd.", 15_000_000, date(2027, 4, 15), date(2026, 10, 15))
    invoice("o06", 0, "GIB2026000004821", "Atlas Yapı Malzemeleri A.Ş.", "1234567890", "Mavi Lojistik A.Ş.", [("Çimento 50 kg", 120, 18_500), ("İnşaat Demiri", 8, 2_450_000), ("Nakliye Hizmeti", 1, 850_000)], date(2026, 11, 3), date(2026, 12, 3))
    invoice("o07", 1, "ABC2026000000377", "Nova Yazılım Hizmetleri Ltd.", "9988776655", "Güneş Gıda Ltd.", [("Aylık Yazılım Lisansı", 12, 149_900), ("Kurulum Hizmeti", 1, 2_250_000)], date(2026, 10, 28), date(2026, 11, 27))
    invoice("o08", 2, "TKS2026000011093", "Pamuk Tekstil San. A.Ş.", "4455667788", "Aslan Tekstil A.Ş.", [("Pamuk İplik 30/1", 450, 12_750), ("Boyama Hizmeti", 450, 3_300), ("Paketleme", 90, 1_875)], date(2026, 11, 7), date(2027, 1, 6))
    utility("o09", 1, "Boğaziçi Enerji Dağıtım A.Ş.", "Selma Aydın", 234_050, date(2026, 11, 4), date(2026, 11, 22))
    receipt_transfer("o10", 0, "Anadolu Ticaret Bankası A.Ş.", "Mavi Lojistik A.Ş.", "Atlas Yapı Malzemeleri A.Ş.", 7_620_000, date(2026, 11, 6), "2026110600418823", "EFT", 1_250)
    receipt_transfer("o11", 1, "Marmara Katılım Bankası A.Ş.", "Selma Aydın", "Hakan Polat", 2_250_000, date(2026, 11, 8), "FST9081774421", "FAST", 0)
    slip("o12", 1, "KARDEŞLER MARKET", "3344556677", [("SUT 1L", 4_250), ("EKMEK", 1_200), ("PEYNIR 500G", 21_990), ("DETERJAN", 28_750), ("MEYVE SUYU", 6_495)], date(2026, 11, 7), "0187", "KREDI KARTI")
    slip("o13", 2, "YOL PETROL A.Ş.", "1122334455", [("KURSUNSUZ 95 42,18 LT", 248_940)], date(2026, 11, 8), "0044", "NAKIT")
    loan("o14", 0, "Anadolu Ticaret Bankası A.Ş.", 12_000_000, 42.0, 12, date(2026, 12, 15), date(2026, 11, 15))
    loan("o15", 1, "Marmara Katılım Bankası A.Ş.", 50_000_000, 48.0, 24, date(2027, 1, 5), date(2026, 12, 5))
    loan("o16", 0, "Ege Kalkınma Bankası A.Ş.", 120_000_000, 39.6, 36, date(2026, 12, 20), date(2026, 11, 20))
    loan("o17", 2, "Toros Bankası A.Ş.", 30_000_000, 45.0, 18, date(2026, 12, 10), date(2026, 11, 10))
    statement("o18", 0, "Anadolu Ticaret Bankası A.Ş.", 18, date(2026, 11, 2), date(2026, 11, 12))
    statement("o19", 1, "Marmara Katılım Bankası A.Ş.", 24, date(2026, 11, 5), date(2026, 11, 15))
    statement("o20", 0, "Ege Kalkınma Bankası A.Ş.", 42, date(2026, 11, 8), date(2026, 11, 18))
    own = ["Mavi Lojistik A.Ş.", "Selma Aydın"]
    hand = "Bradley Hand Bold.ttf"
    cheque("o21", 1, "Anadolu Ticaret Bankası A.Ş.", "8820117", "Mavi Lojistik A.Ş.", "Kaya İnşaat San. Tic.", 9_750_000, date(2027, 1, 12), date(2026, 11, 4), "Kadıköy", hand, "payable", "Kaya İnşaat San. Tic.", own)
    cheque("o22", 1, "Marmara Katılım Bankası A.Ş.", "3301458", "Delta Hırdavat Ltd. Şti.", "Mavi Lojistik A.Ş.", 4_260_000, date(2026, 12, 28), date(2026, 11, 3), "Bursa", hand, "receivable", "Delta Hırdavat Ltd. Şti.", own)
    cheque("o23", 2, "Ege Kalkınma Bankası A.Ş.", "6612093", "Aslan Tekstil A.Ş.", "Mert Yılmaz", 13_100_000, date(2027, 2, 5), date(2026, 10, 30), "İzmir", hand, "receivable", "Aslan Tekstil A.Ş.", own)
    cheque("o24", 2, "Toros Bankası A.Ş.", "9034567", "Selma Aydın", "Yeşil Oto Ltd.", 30_000_000, date(2027, 2, 3), date(2026, 11, 6), "Adana", "Arial.ttf", "payable", "Yeşil Oto Ltd.", own)
    invoice("o25", 0, "MVL2026000000912", "Mavi Lojistik A.Ş.", "6677889900", "Güneş Gıda Ltd.", [("Nakliye Hizmeti", 3, 1_450_000), ("Depolama", 1, 620_000)], date(2026, 11, 2), date(2026, 12, 2), "receivable", "Güneş Gıda Ltd.", own)
    invoice("o26", 1, "ATL2026000005533", "Atlas Yapı Malzemeleri A.Ş.", "1234567890", "Mavi Lojistik A.Ş.", [("Kalıp Malzemesi", 10, 87_500)], date(2026, 11, 5), date(2026, 12, 5), "payable", "Atlas Yapı Malzemeleri A.Ş.", own)
    promissory("o27", 1, "S-2026-391", "Selma Aydın", "Yeşil Oto Ltd.", 6_500_000, date(2027, 1, 31), date(2026, 11, 1), "payable", "Yeşil Oto Ltd.", own)
    receipt_transfer("o28", 1, "Anadolu Ticaret Bankası A.Ş.", "Hakan Polat", "Mavi Lojistik A.Ş.", 1_850_000, date(2026, 11, 7), "2026110700912244", "FAST", 0, "income", "Hakan Polat", own)
    (ROOT / "expected.json").write_text(json.dumps(DOCUMENTS, ensure_ascii=False, indent=1), encoding="utf8")
    print(f"{len(DOCUMENTS)} belge: {DOCS}")


main()
