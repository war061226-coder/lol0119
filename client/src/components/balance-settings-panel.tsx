import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, Save, Plus, Trash2, RotateCcw } from "lucide-react";
import { type BalanceSettings, type InsertBalanceSettings } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

interface BalanceSettingsPanelProps {
  selectedSettingsId?: string;
  onSettingsChange?: (settingsId: string) => void;
}

export default function BalanceSettingsPanel({ selectedSettingsId, onSettingsChange }: BalanceSettingsPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("select");
  const [currentSettings, setCurrentSettings] = useState<BalanceSettings | null>(null);
  const [formData, setFormData] = useState<Partial<InsertBalanceSettings>>({});

  // Fetch all balance settings
  const { data: settingsData } = useQuery({
    queryKey: ["/api/balance-settings"],
    enabled: isOpen,
  });

  // Fetch default balance settings
  const { data: defaultSettingsData } = useQuery({
    queryKey: ["/api/balance-settings/default"],
    enabled: isOpen,
  });

  // Create new balance settings
  const createSettingsMutation = useMutation({
    mutationFn: (data: InsertBalanceSettings) => apiRequest("POST", "/api/balance-settings", data),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/balance-settings"] });
      toast({
        title: "성공",
        description: response?.message || "새 밸런스 설정이 생성되었습니다.",
      });
      setActiveTab("select");
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "밸런스 설정 생성에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Update balance settings
  const updateSettingsMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertBalanceSettings> }) => 
      apiRequest("PUT", `/api/balance-settings/${id}`, data),
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/balance-settings"] });
      toast({
        title: "성공",
        description: response?.message || "밸런스 설정이 수정되었습니다.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "밸런스 설정 수정에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  // Delete balance settings
  const deleteSettingsMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/balance-settings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/balance-settings"] });
      toast({
        title: "성공",
        description: "밸런스 설정이 삭제되었습니다.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "오류",
        description: error.message || "밸런스 설정 삭제에 실패했습니다.",
        variant: "destructive",
      });
    },
  });

  const settings = Array.isArray(settingsData) ? settingsData : (settingsData as any)?.settings || [];
  const defaultSettings = (defaultSettingsData as any)?.settings;

  useEffect(() => {
    if (selectedSettingsId && settings.length > 0) {
      const selected = settings.find((s: BalanceSettings) => s.id === selectedSettingsId);
      if (selected) {
        setCurrentSettings(selected);
      }
    } else if (defaultSettings) {
      setCurrentSettings(defaultSettings);
    }
  }, [selectedSettingsId, settings, defaultSettings]);

  const resetForm = () => {
    setFormData({
      name: "",
      mmrWeight: 0.7,
      positionWeight: 0.3,
      winRateWeight: 0,
      topWeight: 1.0,
      jgWeight: 1.1,
      midWeight: 1.2,
      adcWeight: 1.0,
      supWeight: 0.9,
      mmrTolerance: 20.0,
    });
  };

  const loadSettingsToForm = (settings: BalanceSettings) => {
    setFormData({
      name: settings.name,
      mmrWeight: settings.mmrWeight,
      positionWeight: settings.positionWeight,
      winRateWeight: settings.winRateWeight,
      topWeight: settings.topWeight,
      jgWeight: settings.jgWeight,
      midWeight: settings.midWeight,
      adcWeight: settings.adcWeight,
      supWeight: settings.supWeight,
      mmrTolerance: settings.mmrTolerance,
    });
    setCurrentSettings(settings);
    setActiveTab("edit");
  };

  const handleCreate = () => {
    if (!formData.name?.trim()) {
      toast({
        title: "오류",
        description: "설정 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    const totalWeight = (formData.mmrWeight || 0) + (formData.positionWeight || 0) + (formData.winRateWeight || 0);
    if (Math.abs(totalWeight - 1.0) > 0.001) {
      toast({
        title: "오류",
        description: "밸런스 가중치의 합은 1.0이어야 합니다.",
        variant: "destructive",
      });
      return;
    }

    createSettingsMutation.mutate(formData as InsertBalanceSettings);
  };

  const handleUpdate = () => {
    if (!currentSettings) return;

    if (formData.mmrWeight !== undefined && formData.positionWeight !== undefined) {
      const totalWeight = formData.mmrWeight + formData.positionWeight + (formData.winRateWeight || 0);
      if (Math.abs(totalWeight - 1.0) > 0.001) {
        toast({
          title: "오류",
          description: "밸런스 가중치의 합은 1.0이어야 합니다.",
          variant: "destructive",
        });
        return;
      }
    }

    updateSettingsMutation.mutate({
      id: currentSettings.id,
      data: formData,
    });
  };

  const handleDelete = (settingsToDelete: BalanceSettings) => {
    if (settingsToDelete.isDefault) {
      toast({
        title: "오류",
        description: "기본 설정은 삭제할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    deleteSettingsMutation.mutate(settingsToDelete.id);
  };

  const handleSettingsSelect = (settingsId: string) => {
    onSettingsChange?.(settingsId);
    setIsOpen(false);
  };

  useEffect(() => {
    if (isOpen && activeTab === "create") {
      resetForm();
    }
  }, [isOpen, activeTab]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-balance-settings">
          <Settings className="h-4 w-4 mr-2" />
          밸런스 설정
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>밸런스 설정 관리</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="select">설정 선택</TabsTrigger>
            <TabsTrigger value="create">새 설정</TabsTrigger>
            <TabsTrigger value="edit" disabled={!currentSettings}>설정 수정</TabsTrigger>
          </TabsList>

          <TabsContent value="select" className="space-y-4">
            <div className="grid gap-4">
              {settings.map((setting: BalanceSettings) => (
                <Card
                  key={setting.id}
                  className={`cursor-pointer transition-colors ${
                    selectedSettingsId === setting.id ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => handleSettingsSelect(setting.id)}
                  data-testid={`card-balance-setting-${setting.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{setting.name}</h3>
                          {setting.isDefault && (
                            <Badge variant="secondary">기본</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          MMR: {Math.round(setting.mmrWeight * 100)}% | 
                           포지션: {Math.round(setting.positionWeight * 100)}% |
                           내전 승률: {Math.round(setting.winRateWeight * 100)}%
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadSettingsToForm(setting);
                          }}
                          data-testid={`button-edit-${setting.id}`}
                        >
                          수정
                        </Button>
                        {!setting.isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(setting);
                            }}
                            data-testid={`button-delete-${setting.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="create" className="space-y-6">
            <BalanceSettingsForm
              formData={formData}
              setFormData={setFormData}
              onSave={handleCreate}
              onReset={resetForm}
              isLoading={createSettingsMutation.isPending}
              saveButtonText="설정 생성"
            />
          </TabsContent>

          <TabsContent value="edit" className="space-y-6">
            {currentSettings && (
              <BalanceSettingsForm
                formData={formData}
                setFormData={setFormData}
                onSave={handleUpdate}
                onReset={() => loadSettingsToForm(currentSettings)}
                isLoading={updateSettingsMutation.isPending}
                saveButtonText="설정 수정"
                isEditMode={true}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface BalanceSettingsFormProps {
  formData: Partial<InsertBalanceSettings>;
  setFormData: (data: Partial<InsertBalanceSettings>) => void;
  onSave: () => void;
  onReset: () => void;
  isLoading: boolean;
  saveButtonText: string;
  isEditMode?: boolean;
}

function BalanceSettingsForm({ 
  formData, 
  setFormData, 
  onSave, 
  onReset, 
  isLoading, 
  saveButtonText,
  isEditMode = false
}: BalanceSettingsFormProps) {
  const totalWeight = (formData.mmrWeight || 0) + (formData.positionWeight || 0) + (formData.winRateWeight || 0);
  const isWeightValid = Math.abs(totalWeight - 1.0) <= 0.001;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="settings-name">설정 이름</Label>
        <Input
          id="settings-name"
          value={formData.name || ""}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="예: 공격적 밸런싱"
          data-testid="input-settings-name"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">밸런스 가중치</CardTitle>
          <p className="text-sm text-muted-foreground">
            가중치의 합은 1.0이어야 합니다. 현재 합계: {totalWeight.toFixed(3)} 
            {!isWeightValid && <span className="text-red-500 ml-2">⚠️ 가중치를 조정해주세요</span>}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>MMR 가중치</Label>
                <span className="text-sm font-mono">{Math.round((formData.mmrWeight || 0) * 100)}%</span>
              </div>
              <Slider
                value={[formData.mmrWeight || 0]}
                onValueChange={([value]) => setFormData({ ...formData, mmrWeight: value })}
                max={1}
                step={0.01}
                className="w-full"
                data-testid="slider-mmr-weight"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>포지션 가중치</Label>
                <span className="text-sm font-mono">{Math.round((formData.positionWeight || 0) * 100)}%</span>
              </div>
              <Slider
                value={[formData.positionWeight || 0]}
                onValueChange={([value]) => setFormData({ ...formData, positionWeight: value })}
                max={1}
                step={0.01}
                className="w-full"
                data-testid="slider-position-weight"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>내전 총승률 가중치</Label>
                <span className="text-sm font-mono">{Math.round((formData.winRateWeight || 0) * 100)}%</span>
              </div>
              <Slider
                value={[formData.winRateWeight || 0]}
                onValueChange={([value]) => setFormData({ ...formData, winRateWeight: value })}
                max={1}
                step={0.01}
                className="w-full"
                data-testid="slider-win-rate-weight"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                내전 기록이 있는 플레이어의 전체 승률 차이가 작아지도록 팀을 구성합니다. 경기 기록이 없는 플레이어는 50%로 계산합니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">포지션별 중요도</CardTitle>
          <p className="text-sm text-muted-foreground">
            각 포지션의 중요도를 설정합니다. 높을수록 그 포지션의 플레이어가 팀 밸런싱에 더 큰 영향을 미칩니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'topWeight', label: 'TOP', color: 'text-blue-500' },
            { key: 'jgWeight', label: 'JG', color: 'text-green-500' },
            { key: 'midWeight', label: 'MID', color: 'text-purple-500' },
            { key: 'adcWeight', label: 'ADC', color: 'text-red-500' },
            { key: 'supWeight', label: 'SUP', color: 'text-yellow-500' },
          ].map(({ key, label, color }) => (
            <div key={key}>
              <div className="flex justify-between items-center mb-2">
                <Label className={color}>{label}</Label>
                <span className="text-sm font-mono">{(formData[key as keyof typeof formData] as number || 0).toFixed(1)}</span>
              </div>
              <Slider
                value={[formData[key as keyof typeof formData] as number || 0]}
                onValueChange={([value]) => setFormData({ ...formData, [key]: value })}
                min={0.5}
                max={2}
                step={0.1}
                className="w-full"
                data-testid={`slider-${key}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">허용 오차</CardTitle>
          <p className="text-sm text-muted-foreground">
            팀 간 차이를 얼마나 허용할지 설정합니다. 낮을수록 더 엄격한 밸런싱을 합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>MMR 허용 차이</Label>
              <span className="text-sm font-mono">{formData.mmrTolerance || 0}</span>
            </div>
            <Slider
              value={[formData.mmrTolerance || 0]}
              onValueChange={([value]) => setFormData({ ...formData, mmrTolerance: value })}
              min={10}
              max={100}
              step={5}
              className="w-full"
              data-testid="slider-mmr-tolerance"
            />
          </div>

        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          onClick={onSave}
          disabled={isLoading || !formData.name?.trim() || !isWeightValid}
          className="flex-1"
          data-testid="button-save-settings"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveButtonText}
        </Button>
        <Button
          variant="outline"
          onClick={onReset}
          disabled={isLoading}
          data-testid="button-reset-settings"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          초기화
        </Button>
      </div>
    </div>
  );
}