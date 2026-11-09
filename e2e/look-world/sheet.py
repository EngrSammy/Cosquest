import sys, os
from PIL import Image
d=sys.argv[1]; out=sys.argv[2]; names=sys.argv[3].split(",")
ims=[Image.open(os.path.join(d,n+".png")).convert("RGB").resize((360,640)) for n in names]
cols=min(4,len(ims)); rows=(len(ims)+cols-1)//cols
o=Image.new("RGB",(cols*360,rows*640))
for i,im in enumerate(ims): o.paste(im,((i%cols)*360,(i//cols)*640))
o.save(out,quality=82)
