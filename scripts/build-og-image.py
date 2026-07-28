# scripts/build-og-image.py — 產生分享預覽圖 public/og-image-v3.jpg(1200×630)
#
# 執行:python3 scripts/build-og-image.py   (需要 Pillow 與 Noto CJK 字型)
#
# 設計上的兩個限制,改圖時請一併保留:
#   1) 檔案務必遠小於 1MB。舊版是 1,062,567 bytes 的 PNG,剛好超過 1MB,
#      LINE 的爬蟲會直接放棄抓取、改顯示自己的預設佔位圖。
#   2) 主要文字必須落在「中央正方形」範圍內(x 介於 285~915)。
#      部分平台會把 1200×630 置中裁成正方形縮圖,靠左或靠右的標題會被切掉;
#      兩側的宮位格只是裝飾,被切掉不影響理解。
#   換圖時記得同步遞增 index.html 的 og:image 檔名版號(各平台用 URL 當快取鍵)。

from PIL import Image, ImageDraw, ImageFont
import os
W,H=1200,630
PAGE_BG=(233,226,211); INK=(43,38,33); RED=(166,61,47); GOLD=(138,109,59); CREAM=(244,237,224)
serif_b='/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
sans_r='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
sans_b='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def tci(p):
    for i in range(10):
        try:
            f=ImageFont.truetype(p,40,index=i)
            if f.getbbox('紫微斗數')[2]>0: return i
        except Exception: pass
    return 0
i_sr,i_sb,i_fb=tci(sans_r),tci(sans_b),tci(serif_b)
im=Image.new('RGB',(W,H),PAGE_BG); d=ImageDraw.Draw(im,'RGBA')
f_br=ImageFont.truetype(sans_b,19,index=i_sb); f_st=ImageFont.truetype(sans_r,17,index=i_sr)

# 兩側各放一疊宮位格作為裝飾(中央方形裁切後仍看得到部分格子,但主文字不會被切掉)
def col(x, items, highlight=None):
    CELL,GAP=112,8; y=54
    for k,(star,br) in enumerate(items):
        hl = (k==highlight)
        d.rounded_rectangle([x,y,x+CELL,y+CELL], radius=6,
            fill=CREAM, outline=RED+(200,) if hl else GOLD+(80,), width=3 if hl else 1)
        if star: d.text((x+9,y+9),star,font=f_st,fill=RED if hl else GOLD)
        d.text((x+CELL-9,y+CELL-9),br,font=f_br,fill=INK+(140,),anchor='rs')
        if hl: d.text((x+9,y+CELL-9),'命宮',font=f_st,fill=RED,anchor='ls')
        y+=CELL+GAP
col(40,  [('天機','巳'),('七殺','辰'),('天梁','卯'),('天相','寅')], highlight=3)
col(1048,[('破軍','申'),('廉貞','酉'),('','戌'),('太陰','亥')])

# 中央文字區(垂直置中,水平置中)——方形裁切後仍完整
f_title=ImageFont.truetype(serif_b,61,index=i_fb)
f_sub=ImageFont.truetype(sans_r,29,index=i_sr)
f_small=ImageFont.truetype(sans_r,22,index=i_sr)
f_tag=ImageFont.truetype(sans_b,23,index=i_sb)
CX=W//2
d.text((CX,166),'紫微斗數・八字排盤',font=f_title,fill=INK,anchor='mm')
d.line([CX-140,218,CX+140,218],fill=RED,width=4)
d.text((CX,282),'輸入生辰，立即看懂你的命盤',font=f_sub,fill=INK+(215,),anchor='mm')
d.text((CX,336),'十二宮位・四柱八字・大限流年・白話解讀',font=f_sub,fill=INK+(215,),anchor='mm')

# 中央下方:八字四柱示意
PW,PH,PG=104,96,14; total=4*PW+3*PG; px=CX-total//2; py=396
for stem,branch,label in [('庚','午','年'),('乙','酉','月'),('乙','亥','日'),('癸','未','時')]:
    d.rounded_rectangle([px,py,px+PW,py+PH], radius=6, fill=(43,38,33))
    d.text((px+PW/2,py+30),stem+branch,font=ImageFont.truetype(serif_b,30,index=i_fb),fill=CREAM,anchor='mm')
    d.text((px+PW/2,py+70),label+'柱',font=ImageFont.truetype(sans_r,17,index=i_sr),fill=(244,237,224,160),anchor='mm')
    px+=PW+PG
d.text((CX,528),'免費・免註冊・所有計算都在你的瀏覽器完成',font=f_tag,fill=RED,anchor='mm')
d.text((CX,566),'生辰資料不會上傳到任何伺服器',font=f_small,fill=INK+(150,),anchor='mm')
d.rectangle([0,0,W-1,H-1],outline=GOLD+(80,),width=1)

im.save('public/og-image-v3.jpg','JPEG',quality=90,optimize=True,progressive=True)
print('已產生 public/og-image-v3.jpg,大小', round(os.path.getsize('public/og-image-v3.jpg')/1024,1), 'KB')
