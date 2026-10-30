using System.Collections;
using System.Reflection;
using System.Text.Json;
using DirectStrikeCompanion;
using Sc2DirectStrike.Parser;
using s2protocol.NET;
using s2protocol.NET.Models;

// Offline evidence only: no library writes, UI changes or inferred attribution.
var isZagara=args.Contains("--zagara");
var fixture = JsonDocument.Parse(File.ReadAllText(isZagara?"verification/impact-zagara-replay.json":"verification/impact-real-replay.json").TrimStart('\uFEFF'));
var path = fixture.RootElement.GetProperty("match").GetProperty("path").GetString()!;
var replay = await new ReplayDecoder().DecodeAsync(path, new ReplayDecoderOptions { Details=true,Initdata=true,TrackerEvents=true,GameEvents=true });
if(args.Contains("--map-handles")){
 var description=replay?.Initdata?.GameDescription ?? throw new InvalidDataException("Replay has no decoded game description.");
 using var replayStream=File.OpenRead(path);
 File.WriteAllText("verification/replay-map-handles.json",JsonSerializer.Serialize(new {
  path,hash=Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(replayStream)),
  detailsMapFileName=replay!.Details?.MapFileName,
  description.MapFileName,description.GameCacheName,description.MapAuthorName,
  description.MapFileSyncChecksum,description.ModFileSyncChecksum,description.CacheHandles
 },new JsonSerializerOptions{WriteIndented=true}));
 Console.WriteLine($"Map handle probe: {description.CacheHandles.Count} handles.");return;
}
var parsed = Sc2DirectStrikeParser.Parse(replay!);
if(!isZagara) File.WriteAllText("verification/raw-event-inventory.json",JsonSerializer.Serialize(new {
 banks=replay!.GameEvents!.BaseGameEvents.Where(e=>e.GetType().Name.StartsWith("SBank")).GroupBy(e=>e.GetType().Name).Select(g=>new{type=g.Key,count=g.Count(),firstLoop=g.Min(e=>e.Gameloop),lastLoop=g.Max(e=>e.Gameloop)}),
 bankValues=replay.GameEvents.BaseGameEvents.Where(e=>e.GetType().Name=="SBankValueEvent").Select(e=>e.GetType().GetProperties().ToDictionary(p=>p.Name,p=>p.GetValue(e))),
 events=replay.GameEvents!.BaseGameEvents.GroupBy(e=>e is UnknownGameEvent u?u.EventTypeName:e.GetType().Name).Select(g=>new{type=g.Key,count=g.Count()}),
 upgrades=replay.TrackerEvents!.SUpgradeEvents.GroupBy(e=>e.UpgradeTypeName).Select(g=>new{type=g.Key,count=g.Count()})
},new JsonSerializerOptions{WriteIndented=true}));
var extractor=typeof(CombatStatsExtractor);
var map=(IDictionary<int,DirectStrikePlayer>)extractor.GetMethod("MapPlayers",BindingFlags.NonPublic|BindingFlags.Static)!.Invoke(null,[replay,parsed.Players.ToList()])!;
var tracker=replay!.TrackerEvents!;
File.WriteAllText("verification/owner-control-evidence.json", JsonSerializer.Serialize(new {
 path,
 changes=tracker.SUnitOwnerChangeEvents.Where(e=>map.ContainsKey(e.ControlPlayerId)&&e.ControlPlayerId!=e.UpkeepPlayerId).Select(e=>new {
  loop=e.Gameloop,index=e.UnitTagIndex,recycle=e.UnitTagRecycle,upkeep=e.UpkeepPlayerId,controller=e.ControlPlayerId,
  births=tracker.SUnitBornEvents.Where(b=>b.UnitTagIndex==e.UnitTagIndex&&b.UnitTagRecycle==e.UnitTagRecycle).Select(b=>new {b.Gameloop,b.UnitTypeName,b.UpkeepPlayerId,b.ControlPlayerId}),
  kills=tracker.SUnitDiedEvents.Where(d=>d.KillerUnitTagIndex==e.UnitTagIndex&&d.KillerUnitTagRecycle==e.UnitTagRecycle).Select(d=>new {d.Gameloop,d.KillerPlayerId})
 })
}, new JsonSerializerOptions{WriteIndented=true}));
if(args.Contains("--summons")){
 var born=tracker.SUnitBornEvents;
 var deathsByTag=tracker.SUnitDiedEvents.ToLookup(e=>(e.UnitTagIndex,e.UnitTagRecycle));
 var rows=born.Select(e=>new{loop=e.Gameloop,type=e.UnitTypeName,owner=e.UpkeepPlayerId,controller=e.ControlPlayerId,tag=$"{e.UnitTagIndex}:{e.UnitTagRecycle}",creatorIndex=e.CreatorUnitTagIndex,creatorRecycle=e.CreatorUnitTagRecycle,ability=e.CreatorAbilityName,parentDeathLoops=deathsByTag[(e.CreatorUnitTagIndex??-1,e.CreatorUnitTagRecycle??-1)].Select(d=>d.Gameloop).ToArray(),
 parent=born.Where(p=>p.UnitTagIndex==e.CreatorUnitTagIndex&&p.UnitTagRecycle==e.CreatorUnitTagRecycle&&p.Gameloop<=e.Gameloop).Select(p=>new{type=p.UnitTypeName,owner=p.UpkeepPlayerId,loop=p.Gameloop}).ToArray()}).ToArray();
 File.WriteAllText(isZagara?"verification/zagara-summons.json":"verification/dehaka-summons.json",JsonSerializer.Serialize(new{success=true,path,rows},new JsonSerializerOptions{WriteIndented=true}));
 Console.WriteLine($"Summon probe: {rows.Length} births, {rows.Count(r=>r.creatorIndex.HasValue&&r.creatorRecycle.HasValue)} creator tags.");return;
}

var raw=((IEnumerable)extractor.GetMethod("UnitEvents",BindingFlags.NonPublic|BindingFlags.Static)!.Invoke(null,[tracker])!).Cast<object>().ToArray();
int Int(object e,string key)=>Convert.ToInt32(e.GetType().GetProperty(key)!.GetValue(e));
int? NullableInt(object e,string key)=>(int?)e.GetType().GetProperty(key)!.GetValue(e);
string Str(object e,string key)=>e.GetType().GetProperty(key)!.GetValue(e)?.ToString()??"";
string Identity(DirectStrikePlayer p)=>$"{p.Region}-S2-{p.Realm}-{p.Id}";
var events=raw.OrderBy(e=>Int(e,"Loop")).ThenBy(e=>Str(e,"Kind") switch {"Died"=>3,"TypeChange"=>2,"OwnerChange"=>1,_=>0}).ToList();
var owners=new Dictionary<(int,int),int>();var controllers=new Dictionary<(int,int),int>();var types=new Dictionary<(int,int),string>();var died=new HashSet<(int,int)>();
var nonCombat=new List<object>();var unknown=new List<object>();var grouped=new Dictionary<int,int>();
foreach(var e in events){
 var loop=Int(e,"Loop");if(loop<0)continue;var tag=(Int(e,"Index"),Int(e,"Recycle"));var kind=Str(e,"Kind");
 if(kind!="Died"){
  if(died.Contains(tag))continue;
  if(kind=="OwnerChange")owners[tag]=Int(e,"Owner");else if(kind!="TypeChange")owners.TryAdd(tag,Int(e,"Owner"));
  if(kind!="TypeChange"){if(NullableInt(e,"Controller") is int control)controllers[tag]=control;else controllers.Remove(tag);}
  if(kind=="TypeChange")types[tag]=Str(e,"UnitType");else if(kind is "Born" or "Init" && (!types.ContainsKey(tag)||types[tag]=="Unknown"))types[tag]=Str(e,"UnitType");
  continue;
 }
 if(types.GetValueOrDefault(tag)=="BiomassItem")continue;
 if(!died.Add(tag)||!owners.TryGetValue(tag,out var owner)||!map.TryGetValue(owner,out var victim))continue;
 var killer=NullableInt(e,"Killer");if(killer==null||!map.TryGetValue(killer.Value,out var player)||Identity(player)==Identity(victim)||player.TeamId==victim.TeamId)continue;
 var ki=NullableInt(e,"KillerIndex");var kr=NullableInt(e,"KillerRecycle");var kt=(ki??-1,kr??-1);
 var foundOwner=owners.TryGetValue(kt,out var ko);var type=types.GetValueOrDefault(kt,"Unknown");
 var controlled=controllers.TryGetValue(kt,out var controller)&&controller==killer;
 var reason=ki==null||kr==null?"missing-killer-tag":!foundOwner&&!controlled?"missing-killer-owner":ko!=killer&&!controlled?"killer-owner-mismatch":type=="Unknown"||type.Length==0?"missing-killer-type":null;
 if(types.GetValueOrDefault(tag)=="BiomassItem") nonCombat.Add(new{loop,player=player.Name,playerId=Identity(player),victim=victim.Name,victimId=Identity(victim),knownKillerType=type,reason});
 if(reason==null)continue;
 grouped[killer.Value]=grouped.GetValueOrDefault(killer.Value)+1;
 unknown.Add(new {loop,seconds=loop/22.4,player=player.Name,playerId=Identity(player),killer,reason,ki,kr,knownOwner=foundOwner?(int?)ko:null,knownType=type,victimType=types.GetValueOrDefault(tag),victimTag=tag.ToString(),
  history=events.Where(h=>Int(h,"Index")==ki&&Int(h,"Recycle")==kr).Select(h=>new{loop=Int(h,"Loop"),kind=Str(h,"Kind"),owner=Int(h,"Owner"),type=Str(h,"UnitType"),killer=NullableInt(h,"Killer")}).ToArray()});
}
var actual=CombatStatsExtractor.Extract(replay,parsed);
if(isZagara){
 var updated=System.Text.Json.Nodes.JsonNode.Parse(fixture.RootElement.GetRawText())!;
 foreach(var player in updated["match"]!["players"]!.AsArray()){
  var id=player!["id"]!.GetValue<string>();var combat=actual[id];
  var original=player["combat"]!["values"]!["UnitKills"]!.GetValue<double>();
  if(combat.Values["UnitKills"]!=original||combat.Impact!.Units.Sum(u=>u.Kills)!=original)throw new Exception("Player totals changed: "+id);
  player["combat"]=System.Text.Json.JsonSerializer.SerializeToNode(combat,Store.Json);
 }
 updated["match"]!["statsVersion"]=CombatStatsExtractor.CurrentVersion;
 File.WriteAllText("verification/impact-control-replay.json",updated.ToJsonString());
 var tychusId=fixture.RootElement.GetProperty("match").GetProperty("players").EnumerateArray().Single(p=>p.GetProperty("commander").GetString()=="Tychus").GetProperty("id").GetString()!;
 var tychus=actual[tychusId];
 if(tychus.Impact!.Units.Single(u=>u.Name=="HighArchon").Kills!=3||tychus.Impact.Units.Single(u=>u.Name=="Unknown").Kills!=12)
  throw new Exception("Recorded control transfer did not recover the three HighArchon kills.");
 File.WriteAllText("verification/control-attribution-check.json",JsonSerializer.Serialize(new{success=true,path,version=CombatStatsExtractor.CurrentVersion,
  recoveredType="HighArchon",recoveredKills=3,playerTotalsPreserved=true,
  players=actual.Select(p=>new{id=p.Key,kills=p.Value.Values["UnitKills"],unknown=p.Value.Impact!.Units.FirstOrDefault(u=>u.Name=="Unknown")?.Kills??0})},Store.Json));
}
var expected=JsonSerializer.SerializeToElement(actual);
foreach(var pair in grouped){var id=Identity(map[pair.Key]);var units=expected.GetProperty(id).GetProperty("Impact").GetProperty("Units");var count=units.EnumerateArray().Single(x=>x.GetProperty("Name").GetString()=="Unknown").GetProperty("Kills").GetInt32();if(count!=pair.Value)throw new Exception($"Trace differs from reducer: {id} {count}/{pair.Value}");}
File.WriteAllText(isZagara?"verification/zagara-attribution-probe.json":"verification/unknown-attribution-probe.json",JsonSerializer.Serialize(new{success=true,path,players=map.Select(p=>new{trackerId=p.Key,p.Value.Name,id=Identity(p.Value),p.Value.TeamId,unknown=grouped.GetValueOrDefault(p.Key)}),nonCombat,unknown},new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"Traced {unknown.Count} unknown kills; counts match production reducer.");
