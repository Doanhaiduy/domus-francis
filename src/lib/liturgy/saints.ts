// Lịch các thánh (Proper of Saints) theo Lịch chung Rôma hiện hành + điều chỉnh của Hội đồng Giám mục Việt Nam.
// Mỗi dòng: "MM-DD|bậc|màu|tên". Bậc: S = lễ trọng, FL = lễ kính về Chúa, F = lễ kính, M = lễ nhớ, O = lễ nhớ tùy ý.
// Màu: W trắng, R đỏ, V tím, G xanh. Nhiều lễ nhớ tùy ý cùng ngày ⇒ nhiều dòng.
// Riêng Việt Nam: 24/11 Các Thánh Tử Đạo Việt Nam là LỄ TRỌNG; Thánh Têrêsa Hài Đồng Giêsu (01/10) và Thánh Phanxicô Xaviê (03/12)
// — bổn mạng các xứ truyền giáo — là LỄ KÍNH.

export type SaintRank = "S" | "FL" | "F" | "M" | "O";
export type SaintColor = "W" | "R" | "V" | "G";

export interface SaintEntry {
  mmdd: string;
  rank: SaintRank;
  color: SaintColor;
  title: string;
}

const RAW = `
01-02|M|W|Thánh Basiliô Cả và Thánh Grêgôriô Nazianzênô, giám mục, tiến sĩ Hội Thánh
01-03|O|W|Kính Danh Rất Thánh Chúa Giêsu
01-07|O|W|Thánh Raymunđô Penyafort, linh mục
01-13|O|W|Thánh Hilariô, giám mục, tiến sĩ Hội Thánh
01-17|M|W|Thánh Antôn, viện phụ
01-20|O|R|Thánh Fabianô, giáo hoàng, tử đạo
01-20|O|R|Thánh Sêbastianô, tử đạo
01-21|M|R|Thánh Anê, trinh nữ, tử đạo
01-22|O|R|Thánh Vinh Sơn, phó tế, tử đạo
01-24|M|W|Thánh Phanxicô Salêsiô, giám mục, tiến sĩ Hội Thánh
01-25|F|W|Thánh Phaolô Tông đồ trở lại
01-26|M|W|Thánh Timôthê và Thánh Titô, giám mục
01-27|O|W|Thánh Angêla Mêrici, trinh nữ
01-28|M|W|Thánh Tôma Aquinô, linh mục, tiến sĩ Hội Thánh
01-31|M|W|Thánh Gioan Bosco, linh mục
02-02|FL|W|Dâng Chúa Giêsu trong Đền Thánh
02-03|O|R|Thánh Blasiô, giám mục, tử đạo
02-03|O|W|Thánh Ansgariô, giám mục
02-05|M|R|Thánh Agata, trinh nữ, tử đạo
02-06|M|R|Thánh Phaolô Miki và các bạn, tử đạo
02-08|O|W|Thánh Giêrônimô Êmilianô
02-08|O|W|Thánh Giuseppina Bakhita, trinh nữ
02-10|M|W|Thánh Scholastica, trinh nữ
02-11|O|W|Đức Mẹ Lộ Đức
02-14|M|W|Thánh Cyrillô, đan sĩ, và Thánh Mêthôđiô, giám mục
02-17|O|W|Bảy Thánh Lập Dòng Tôi Tớ Đức Maria
02-21|O|W|Thánh Phêrô Đamianô, giám mục, tiến sĩ Hội Thánh
02-22|F|W|Lập Ngai Tòa Thánh Phêrô, Tông đồ
02-23|M|R|Thánh Pôlycarpô, giám mục, tử đạo
02-27|O|W|Thánh Grêgôriô Narek, viện phụ, tiến sĩ Hội Thánh
03-04|O|W|Thánh Casimirô
03-07|M|R|Thánh nữ Perpêtua và Thánh nữ Fêlicita, tử đạo
03-08|O|W|Thánh Gioan Thiên Chúa, tu sĩ
03-09|O|W|Thánh Phanxica Rôma, nữ tu
03-17|O|W|Thánh Patriciô, giám mục
03-18|O|W|Thánh Cyrillô Giêrusalem, giám mục, tiến sĩ Hội Thánh
03-19|S|W|Thánh Giuse, Bạn Trăm Năm Đức Trinh Nữ Maria
03-23|O|W|Thánh Turibiô Môngrôvêjô, giám mục
03-25|S|W|Lễ Truyền Tin
04-02|O|W|Thánh Phanxicô Paola, ẩn tu
04-04|O|W|Thánh Isiđôrô, giám mục, tiến sĩ Hội Thánh
04-05|O|W|Thánh Vinh Sơn Ferrer, linh mục
04-07|M|W|Thánh Gioan Baotixita La Salle, linh mục
04-11|M|R|Thánh Stanislaô, giám mục, tử đạo
04-13|O|R|Thánh Martinô I, giáo hoàng, tử đạo
04-21|O|W|Thánh Anselmô, giám mục, tiến sĩ Hội Thánh
04-23|O|R|Thánh Giorgiô, tử đạo
04-23|O|R|Thánh Ađalbertô, giám mục, tử đạo
04-24|O|R|Thánh Fiđêlê Sigmaringen, linh mục, tử đạo
04-25|F|R|Thánh Máccô, tác giả sách Tin Mừng
04-28|O|R|Thánh Phêrô Chanel, linh mục, tử đạo
04-28|O|W|Thánh Louis Maria Grignion de Montfort, linh mục
04-29|M|W|Thánh Catarina Siêna, trinh nữ, tiến sĩ Hội Thánh
04-30|O|W|Thánh Piô V, giáo hoàng
05-01|O|W|Thánh Giuse Thợ
05-02|M|W|Thánh Athanasiô, giám mục, tiến sĩ Hội Thánh
05-03|F|R|Thánh Philipphê và Thánh Giacôbê, Tông đồ
05-10|O|W|Thánh Gioan Avila, linh mục, tiến sĩ Hội Thánh
05-12|O|R|Thánh Nêrêô và Thánh Achillêô, tử đạo
05-12|O|R|Thánh Pancratiô, tử đạo
05-13|O|W|Đức Mẹ Fatima
05-14|F|R|Thánh Matthia, Tông đồ
05-18|O|R|Thánh Gioan I, giáo hoàng, tử đạo
05-20|O|W|Thánh Bernarđinô Siêna, linh mục
05-21|O|R|Thánh Christôphôrô Magallanes, linh mục, và các bạn tử đạo
05-22|O|W|Thánh Rita Cascia, nữ tu
05-25|O|W|Thánh Bêđa Khả Kính, linh mục, tiến sĩ Hội Thánh
05-25|O|W|Thánh Grêgôriô VII, giáo hoàng
05-25|O|W|Thánh Maria Mađalêna Pazzi, trinh nữ
05-26|M|W|Thánh Philipphê Nêri, linh mục
05-27|O|W|Thánh Augustinô Canterbury, giám mục
05-29|O|W|Thánh Phaolô VI, giáo hoàng
05-31|F|W|Đức Maria Thăm Viếng Bà Êlizabét
06-01|M|R|Thánh Giustinô, tử đạo
06-02|O|R|Thánh Marcellinô và Thánh Phêrô, tử đạo
06-03|M|R|Thánh Carôlô Lwanga và các bạn, tử đạo
06-05|M|R|Thánh Bônifaxiô, giám mục, tử đạo
06-06|O|W|Thánh Nôbertô, giám mục
06-09|O|W|Thánh Ephrem, phó tế, tiến sĩ Hội Thánh
06-11|M|R|Thánh Barnaba, Tông đồ
06-13|M|W|Thánh Antôn Pađôva, linh mục, tiến sĩ Hội Thánh
06-19|O|W|Thánh Rômualđô, viện phụ
06-21|M|W|Thánh Aloysiô Gonzaga, tu sĩ
06-22|O|W|Thánh Paulinô Nôla, giám mục
06-22|O|R|Thánh Gioan Fisher, giám mục, và Thánh Tôma More, tử đạo
06-24|S|W|Sinh Nhật Thánh Gioan Tẩy Giả
06-27|O|W|Thánh Cyrillô Alexanđria, giám mục, tiến sĩ Hội Thánh
06-28|M|R|Thánh Irênê, giám mục, tử đạo, tiến sĩ Hội Thánh
06-29|S|R|Thánh Phêrô và Thánh Phaolô, Tông đồ
06-30|O|R|Các Thánh tử đạo tiên khởi của Giáo đoàn Rôma
07-03|F|R|Thánh Tôma, Tông đồ
07-04|O|W|Thánh Êlisabét Bồ Đào Nha
07-05|O|W|Thánh Antôn Maria Zaccaria, linh mục
07-06|O|R|Thánh Maria Goretti, trinh nữ, tử đạo
07-09|O|R|Thánh Augustinô Triệu Vinh, linh mục, và các bạn tử đạo
07-11|M|W|Thánh Bênêđictô, viện phụ
07-13|O|W|Thánh Henricô
07-14|O|W|Thánh Camillô Lellis, linh mục
07-15|M|W|Thánh Bônaventura, giám mục, tiến sĩ Hội Thánh
07-16|O|W|Đức Mẹ núi Cát Minh
07-20|O|R|Thánh Apollinarê, giám mục, tử đạo
07-21|O|W|Thánh Laurensô Brinđisi, linh mục, tiến sĩ Hội Thánh
07-22|F|W|Thánh Maria Mađalêna
07-23|O|W|Thánh Brigitta, nữ tu
07-24|O|W|Thánh Sarbêliô Makhluf, linh mục
07-25|F|R|Thánh Giacôbê, Tông đồ
07-26|M|W|Thánh Gioakim và Thánh Anna, song thân Đức Maria
07-29|M|W|Thánh Mátta, Thánh Maria và Thánh Ladarô
07-30|O|W|Thánh Phêrô Kim Ngôn, giám mục, tiến sĩ Hội Thánh
07-31|M|W|Thánh Inhaxiô Loyola, linh mục
08-01|M|W|Thánh Anphongsô Maria Liguori, giám mục, tiến sĩ Hội Thánh
08-02|O|W|Thánh Êusêbiô Vercellêsi, giám mục
08-02|O|W|Thánh Phêrô Giulianô Eymard, linh mục
08-04|M|W|Thánh Gioan Maria Vianney, linh mục
08-05|O|W|Cung hiến Thánh đường Đức Maria
08-06|FL|W|Chúa Hiển Dung
08-07|O|R|Thánh Xíttô II, giáo hoàng, và các bạn tử đạo
08-07|O|W|Thánh Cajêtanô, linh mục
08-08|M|W|Thánh Đaminh, linh mục
08-09|O|R|Thánh Têrêsa Bênêđicta Thánh Giá, trinh nữ, tử đạo
08-10|F|R|Thánh Laurensô, phó tế, tử đạo
08-11|M|W|Thánh Clara, trinh nữ
08-12|O|W|Thánh Gioanna Phanxica Chantal, nữ tu
08-13|O|R|Thánh Pontianô, giáo hoàng, và Thánh Hippôlytô, linh mục, tử đạo
08-14|M|R|Thánh Maximilianô Maria Kolbe, linh mục, tử đạo
08-15|S|W|Đức Mẹ Hồn Xác Lên Trời
08-16|O|W|Thánh Stêphanô Hungari
08-19|O|W|Thánh Gioan Eudes, linh mục
08-20|M|W|Thánh Bênađô, viện phụ, tiến sĩ Hội Thánh
08-21|M|W|Thánh Piô X, giáo hoàng
08-22|M|W|Đức Maria Nữ Vương
08-23|O|W|Thánh Rôsa Lima, trinh nữ
08-24|F|R|Thánh Bartôlômêô, Tông đồ
08-25|O|W|Thánh Luy, vua nước Pháp
08-25|O|W|Thánh Giuse Calasanz, linh mục
08-27|M|W|Thánh nữ Mônica
08-28|M|W|Thánh Augustinô, giám mục, tiến sĩ Hội Thánh
08-29|M|R|Thánh Gioan Tẩy Giả bị trảm quyết
09-03|M|W|Thánh Grêgôriô Cả, giáo hoàng, tiến sĩ Hội Thánh
09-05|O|W|Thánh Têrêsa Calcutta, trinh nữ
09-08|F|W|Sinh Nhật Đức Trinh Nữ Maria
09-09|O|W|Thánh Phêrô Claver, linh mục
09-12|O|W|Danh Rất Thánh Đức Maria
09-13|M|W|Thánh Gioan Kim Khẩu, giám mục, tiến sĩ Hội Thánh
09-14|FL|R|Suy Tôn Thánh Giá
09-15|M|W|Đức Mẹ Sầu Bi
09-16|M|R|Thánh Cornêliô, giáo hoàng, và Thánh Cyprianô, giám mục, tử đạo
09-17|O|W|Thánh Rôbertô Bellarminô, giám mục, tiến sĩ Hội Thánh
09-17|O|W|Thánh Hildegarđê Bingen, trinh nữ, tiến sĩ Hội Thánh
09-19|O|R|Thánh Januariô, giám mục, tử đạo
09-20|M|R|Thánh Anrê Kim Têgon, linh mục, Thánh Phaolô Chung Hasang và các bạn tử đạo
09-21|F|R|Thánh Máttêu, Tông đồ, tác giả sách Tin Mừng
09-23|M|W|Thánh Piô Pietrelcina, linh mục
09-26|O|R|Thánh Cosma và Thánh Đamianô, tử đạo
09-27|M|W|Thánh Vinh Sơn Phaolô, linh mục
09-28|O|R|Thánh Venceslaô, tử đạo
09-28|O|R|Thánh Laurensô Ruiz và các bạn tử đạo
09-29|F|W|Các Tổng Lãnh Thiên Thần Micae, Gabriel và Raphael
09-30|M|W|Thánh Giêrônimô, linh mục, tiến sĩ Hội Thánh
10-01|F|W|Thánh Têrêsa Hài Đồng Giêsu, trinh nữ, tiến sĩ Hội Thánh
10-02|M|W|Các Thiên Thần Hộ Thủ
10-04|M|W|Thánh Phanxicô Assisi
10-05|O|W|Thánh Faustina Kowalska, trinh nữ
10-06|O|W|Thánh Brunô, linh mục
10-07|M|W|Đức Mẹ Mân Côi
10-09|O|R|Thánh Điônysiô, giám mục, và các bạn tử đạo
10-09|O|W|Thánh Gioan Lêônarđô, linh mục
10-09|O|W|Thánh Gioan Henry Newman, linh mục, tiến sĩ Hội Thánh
10-11|O|W|Thánh Gioan XXIII, giáo hoàng
10-14|O|R|Thánh Callistô I, giáo hoàng, tử đạo
10-15|M|W|Thánh Têrêsa Avila, trinh nữ, tiến sĩ Hội Thánh
10-16|O|W|Thánh Hedvige, nữ tu
10-16|O|W|Thánh Margarita Maria Alacoque, trinh nữ
10-17|M|R|Thánh Inhaxiô Antiôkhia, giám mục, tử đạo
10-18|F|R|Thánh Luca, tác giả sách Tin Mừng
10-19|O|R|Thánh Gioan Brébeuf, Thánh Isaac Jogues, linh mục, và các bạn tử đạo
10-19|O|W|Thánh Phaolô Thánh Giá, linh mục
10-22|O|W|Thánh Gioan Phaolô II, giáo hoàng
10-23|O|W|Thánh Gioan Capistranô, linh mục
10-24|O|W|Thánh Antôn Maria Claret, giám mục
10-28|F|R|Thánh Simon và Thánh Giuđa, Tông đồ
11-01|S|W|Các Thánh Nam Nữ
11-03|O|W|Thánh Martinô Porres, tu sĩ
11-04|M|W|Thánh Carôlô Borrômêô, giám mục
11-09|FL|W|Cung Hiến Thánh Đường Latêranô
11-10|M|W|Thánh Lêô Cả, giáo hoàng, tiến sĩ Hội Thánh
11-11|M|W|Thánh Martinô Tours, giám mục
11-12|M|R|Thánh Giôsaphát, giám mục, tử đạo
11-15|O|W|Thánh Albertô Cả, giám mục, tiến sĩ Hội Thánh
11-16|O|W|Thánh Margarita Scotland
11-16|O|W|Thánh Gertruđê, trinh nữ
11-17|M|W|Thánh Êlisabét Hungari, nữ tu
11-18|O|W|Cung hiến Thánh đường Thánh Phêrô và Thánh đường Thánh Phaolô, Tông đồ
11-21|M|W|Đức Mẹ Dâng Mình trong Đền Thờ
11-22|M|R|Thánh Cêcilia, trinh nữ, tử đạo
11-23|O|R|Thánh Clêmentê I, giáo hoàng, tử đạo
11-23|O|W|Thánh Côlumbanô, viện phụ
11-24|S|R|Các Thánh Tử Đạo Việt Nam
11-25|O|R|Thánh Catarina Alexanđria, trinh nữ, tử đạo
11-30|F|R|Thánh Anrê, Tông đồ
12-03|F|W|Thánh Phanxicô Xaviê, linh mục, bổn mạng các xứ truyền giáo
12-04|O|W|Thánh Gioan Đamascênô, linh mục, tiến sĩ Hội Thánh
12-06|O|W|Thánh Nicôla, giám mục
12-07|M|W|Thánh Ambrôsiô, giám mục, tiến sĩ Hội Thánh
12-08|S|W|Đức Maria Vô Nhiễm Nguyên Tội
12-09|O|W|Thánh Gioan Điêgô Cuauhtlatoatzin
12-10|O|W|Đức Mẹ Lorétô
12-11|O|W|Thánh Đamasô I, giáo hoàng
12-12|O|W|Đức Mẹ Guađalupê
12-13|M|R|Thánh Lucia, trinh nữ, tử đạo
12-14|M|W|Thánh Gioan Thánh Giá, linh mục, tiến sĩ Hội Thánh
12-21|O|W|Thánh Phêrô Canisiô, linh mục, tiến sĩ Hội Thánh
12-23|O|W|Thánh Gioan Kêty, linh mục
12-26|F|R|Thánh Stêphanô, tử đạo tiên khởi
12-27|F|W|Thánh Gioan, Tông đồ, tác giả sách Tin Mừng
12-28|F|R|Các Thánh Anh Hài, tử đạo
12-29|O|R|Thánh Tôma Becket, giám mục, tử đạo
12-31|O|W|Thánh Silvestê I, giáo hoàng
`;

export const SAINTS: SaintEntry[] = RAW.trim()
  .split("\n")
  .map((l) => {
    const [mmdd, rank, color, title] = l.split("|");
    return { mmdd, rank: rank as SaintRank, color: color as SaintColor, title: title.trim() };
  });

const byDate = new Map<string, SaintEntry[]>();
for (const s of SAINTS) byDate.set(s.mmdd, [...(byDate.get(s.mmdd) ?? []), s]);

/** Các lễ các thánh cố định của ngày "MM-DD". */
export const saintsOn = (mmdd: string): SaintEntry[] => byDate.get(mmdd) ?? [];

/** Lễ có bài đọc riêng trong Sách Bài Đọc (lễ trọng/lễ kính và một số lễ nhớ) — khóa bài đọc "saint-MMDD". */
export const PROPER_READING_DATES = new Set([
  "01-25", "02-02", "02-22", "03-19", "03-25", "04-25", "05-03", "05-14", "05-31", "06-24", "06-29", "07-03", "07-22", "07-25",
  "08-06", "08-10", "08-15", "08-24", "09-08", "09-14", "09-21", "09-29", "10-01", "10-18", "10-28", "11-01", "11-02", "11-09",
  "11-24", "11-30", "12-03", "12-08", "12-26", "12-27", "12-28",
]);
