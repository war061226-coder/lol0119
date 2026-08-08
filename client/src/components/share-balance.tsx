import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Share2, Link2, Copy, Download, MessageCircle } from "lucide-react";
import { type BalanceAnalysis } from "@shared/schema";

interface ShareBalanceProps {
  balanceResult: BalanceAnalysis;
  balanceResultId?: string; // This should be passed from the parent when balance result is saved
}

export default function ShareBalance({ balanceResult, balanceResultId }: ShareBalanceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const { toast } = useToast();

  // Generate share URL
  const shareUrl = balanceResultId 
    ? `${window.location.origin}/share/${balanceResultId}`
    : '';

  const shareText = `LoL 팀 밸런싱 결과 - 밸런스 점수: ${Math.round(balanceResult.balanceScore)}/100`;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "복사 완료",
        description: "클립보드에 복사되었습니다.",
      });
    } catch (error) {
      toast({
        title: "복사 실패",
        description: "클립보드 복사에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const shareToTwitter = () => {
    const text = encodeURIComponent(shareText);
    const url = encodeURIComponent(shareUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  const shareToFacebook = () => {
    const url = encodeURIComponent(shareUrl);
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  };

  const shareToKakao = () => {
    // KakaoTalk sharing (requires KakaoTalk SDK setup)
    const url = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(shareText);
    // For now, use a simple URL scheme
    window.open(`https://story.kakao.com/share?url=${url}&text=${text}`, '_blank');
  };

  const downloadAsImage = async () => {
    setIsGeneratingImage(true);
    try {
      // Find the balance result element to capture
      const balanceElement = document.querySelector('[data-balance-result]') as HTMLElement;
      
      if (!balanceElement) {
        toast({
          title: "이미지 생성 실패",
          description: "밸런싱 결과 요소를 찾을 수 없습니다.",
          variant: "destructive",
        });
        return;
      }

      // Import html2canvas dynamically
      const html2canvas = (await import('html2canvas')).default;
      
      const canvas = await html2canvas(balanceElement, {
        backgroundColor: '#ffffff',
        scale: 1,
        useCORS: true,
        logging: false,
      });

      // Create download link
      const link = document.createElement('a');
      link.download = `lol-team-balance-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();

      toast({
        title: "이미지 다운로드 완료",
        description: "밸런싱 결과가 이미지로 저장되었습니다.",
      });
    } catch (error) {
      console.error('Image generation error:', error);
      toast({
        title: "이미지 생성 실패",
        description: "이미지 생성 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  if (!balanceResultId) {
    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-2" disabled>
            <Share2 className="h-4 w-4" />
            공유하기
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>결과 공유</DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <Share2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              밸런싱 결과가 저장되지 않아 공유할 수 없습니다.
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              팀 밸런싱을 다시 실행해주세요.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2" data-testid="button-share">
          <Share2 className="h-4 w-4" />
          공유하기
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>밸런싱 결과 공유</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Share URL */}
          <div className="space-y-2">
            <label className="text-sm font-medium">공유 링크</label>
            <div className="flex gap-2">
              <Input
                value={shareUrl}
                readOnly
                className="flex-1"
                data-testid="input-share-url"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyToClipboard(shareUrl)}
                data-testid="button-copy-url"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Social Media Sharing */}
          <div className="space-y-3">
            <label className="text-sm font-medium">소셜 미디어에 공유</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={shareToTwitter}
                className="gap-2"
                data-testid="button-share-twitter"
              >
                <MessageCircle className="h-4 w-4" />
                Twitter
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={shareToFacebook}
                className="gap-2"
                data-testid="button-share-facebook"
              >
                <MessageCircle className="h-4 w-4" />
                Facebook
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={shareToKakao}
                className="gap-2"
                data-testid="button-share-kakao"
              >
                <MessageCircle className="h-4 w-4" />
                KakaoTalk
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadAsImage}
                disabled={isGeneratingImage}
                className="gap-2"
                data-testid="button-download-image"
              >
                <Download className="h-4 w-4" />
                {isGeneratingImage ? "생성중..." : "이미지"}
              </Button>
            </div>
          </div>

          {/* Share Information */}
          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4" />
              <span className="font-medium">밸런스 점수:</span>
              <span>{Math.round(balanceResult.balanceScore)}/100</span>
            </div>
            <div className="text-xs text-muted-foreground">
              이 링크를 통해 다른 사람들이 밸런싱 결과를 확인할 수 있습니다.
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}