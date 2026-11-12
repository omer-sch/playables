import json,sys,os
EV={
 "porch-576":   ("LinkEvent000576","Porch",        ["Design","a cozy fall","porch"]),
 "kitchen-578": ("LinkEvent000578","Kitchen",      ["Design","a cozy fall","kitchen"]),
 "trend-193":   ("TrendEvent000193","LivingRoom",  ["Design","a cozy","living room"]),
 "trend-194":   ("TrendEvent000194","HairClipWall",["Design","a hair clip","wall"]),
 "trend-201":   ("TrendEvent000201","GhostGarland",["Design","a ghost","garland"]),
}
VER="v40"
engine_old=None
eng_new=open("engine_new.js").read(); eng_old=open("engine.js").read()
css=open("rating.css").read()
dec=json.JSONDecoder()
out={}
for f,(evid,concept,hero) in EV.items():
    s=open(f"../repo/venue/vote/{f}.html",encoding="utf-8").read()
    i=s.index("window.PLAYABLE_CFG=")+len("window.PLAYABLE_CFG=")
    cfg,n=dec.raw_decode(s[i:])
    assert s.count(eng_old)==1, f
    for mode,tag in (("rating","Full"),("early","EarlyClick")):
        c=json.loads(json.dumps(cfg))
        c.pop("vote",None)
        c["ending"]=mode
        c["title"]=f"Venue-{evid}-{tag}-{VER}"
        c["copy"]["hero"]=hero
        c["copy"]["rest"]=" ".join(hero[1:])
        nodes=len(c["slots"])
        if mode=="early":
            c["earlyAfter"]=5
            c["earlyDelay"]=1200
            c["endTitle"]="Design your dream home"
            c["midBeats"]=[{"after":2,"text":"Beautiful!","light":True},{"after":4,"text":"Great choice!","light":True}]
        else:
            c["rating"]={"title":"Find out your design's rating","score":"?.??","cta":"Download"}
            if nodes<=7: c["midBeats"]=[{"after":2,"text":"Beautiful!","light":True},{"after":4,"text":"Great choice!","light":True},{"after":6,"text":"Looks amazing!","light":True}]
        h=s[:i]+json.dumps(c,ensure_ascii=False)+s[i+n:]
        h=h.replace(eng_old,eng_new)
        h=h.replace("</head>","<style>"+css+"</style></head>",1)
        import re
        h=re.sub(r"<title>[^<]*</title>",f"<title>Venue_Oct26_P_{concept}_{tag}</title>",h,1)
        name=f"Venue_Oct26_P_{concept}_{tag}.html"
        open(f"../out/{name}","w",encoding="utf-8").write(h)
        out[name]=len(h.encode())
for k,v in out.items(): print(k,v)
